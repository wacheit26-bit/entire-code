import axios from 'axios';
import { clearAuthSnapshot } from './authSnapshot';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';
import { clearRole, clearSession, markSession, rolesFromAuthBody, setRole } from './session';
import { normalizeAuthApiBody } from './authResponse';
import {
  getActiveApiBaseUrl,
  getApiBaseCandidates,
  dispatchWithApiFailover,
  isNetworkOrTimeoutError,
  INTERNET_CONNECTION_RETRY_MESSAGE,
} from '../utils/apiBaseUrl';
import { clearWarehouseDashboardCache } from '../utils/warehouseDashboardCache';

export function getBaseUrl() {
  return getActiveApiBaseUrl();
}

/** Initial base at module load; prefer getBaseUrl() for current failover target. */
export const BASE_URL = getActiveApiBaseUrl();

function normalizeRequestConfig(configOrUrl, config) {
  if (typeof configOrUrl === 'string') {
    return {
      ...(config || {}),
      url: configOrUrl,
      method: (config?.method || 'get').toLowerCase(),
    };
  }
  return configOrUrl || {};
}

function attachApiFailover(client) {
  const nativeRequest = client.request.bind(client);

  client.request = function failoverRequest(configOrUrl, maybeConfig) {
    const config = normalizeRequestConfig(configOrUrl, maybeConfig);

    if (config._parallelRaceSingle || getApiBaseCandidates().length < 2) {
      return nativeRequest(configOrUrl, maybeConfig);
    }

    return dispatchWithApiFailover(config, getApiBaseCandidates(), (childConfig) =>
      nativeRequest(childConfig),
    );
  };

  client.interceptors.request.use((config) => {
    if (!config._parallelRaceBase) {
      config.baseURL = getActiveApiBaseUrl();
    }
    return config;
  });
}

export const axiosPublic = axios.create({
  baseURL: getActiveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 20000,
});

export const axiosPrivate = axios.create({
  baseURL: getActiveApiBaseUrl(),
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 30000,
});

function clearContentTypeForFormData(config) {
  if (typeof FormData === 'undefined' || !(config.data instanceof FormData)) {
    return config;
  }
  const headers = config.headers;
  if (headers && typeof headers.set === 'function') {
    headers.set('Content-Type', false);
    return config;
  }
  if (headers) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  }
  return config;
}

function attachAuthAndFormDataHandling(client) {
  client.interceptors.request.use((config) => {
    const token = getAccessToken();
    const h = config.headers?.Authorization;
    const bearerBad =
      !h ||
      h === 'Bearer undefined' ||
      h === 'Bearer null' ||
      (typeof h === 'string' && /^Bearer\s*$/i.test(h.trim()));
    if (token && bearerBad) config.headers.Authorization = `Bearer ${token}`;
    return clearContentTypeForFormData(config);
  });
}

function attachFriendlyNetworkErrors(client) {
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (isNetworkOrTimeoutError(error)) {
        error.message = INTERNET_CONNECTION_RETRY_MESSAGE;
      }
      return Promise.reject(error);
    },
  );
}

attachApiFailover(axiosPublic);
attachApiFailover(axiosPrivate);
attachAuthAndFormDataHandling(axiosPrivate);
attachFriendlyNetworkErrors(axiosPublic);
attachFriendlyNetworkErrors(axiosPrivate);

export default axiosPublic;

export { getAccessToken } from './tokenStore';

/** Single in-flight refresh so parallel 401s do not race and invalidate the session. */
let refreshAccessTokenPromise = null;

export async function refreshAccessToken() {
  if (refreshAccessTokenPromise) return refreshAccessTokenPromise;
  refreshAccessTokenPromise = (async () => {
    try {
      const res = await axiosPublic.get('/refresh', { withCredentials: true, timeout: 8000 });
      const norm = normalizeAuthApiBody(res.data);
      if (!norm.accessToken) throw new Error('Refresh did not return an access token');
      setAccessToken(norm.accessToken);
      const { primaryRole } = rolesFromAuthBody({ role: norm.role, roles: norm.roles });
      if (primaryRole) setRole(primaryRole);
      markSession();
      return norm.accessToken;
    } finally {
      refreshAccessTokenPromise = null;
    }
  })();
  return refreshAccessTokenPromise;
}

export async function logout() {
  try {
    await axiosPrivate.post('/logout', {}, { withCredentials: true });
  } catch {
    // ignore
  } finally {
    clearAccessToken();
    clearRole();
    clearSession();
    clearAuthSnapshot();
    clearWarehouseDashboardCache();
  }
}
