/**
 * Dual API origins with primary-first failover.
 * The first URL in the list (custom domain) is always tried first; the backup
 * origin is only used when the primary fails with a network or server error.
 */

const STORAGE_KEY = 'wache_active_api_base';

/** Primary = custom domain. Backup = Render. Override order with VITE_API_ORIGINS (comma-separated). */
const DEFAULT_API_BASES = [
  'https://wach.wacheelectronics.com/api',
  'https://watcher3-u8aw.onrender.com/api',
];

export const PRIMARY_API_BASE = DEFAULT_API_BASES[0];

function normalizeApiBase(raw) {
  const s = String(raw || '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (s === '/api') return '/api';
  return s.endsWith('/api') ? s : `${s}/api`;
}

function dedupe(list) {
  const seen = new Set();
  return list.filter((item) => {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

/** All configured API base URLs (each ends with /api). */
export function getApiBaseCandidates() {
  const multi = String(import.meta.env.VITE_API_ORIGINS || '').trim();
  if (multi) {
    return dedupe(multi.split(',').map((part) => normalizeApiBase(part)).filter(Boolean));
  }

  const single = normalizeApiBase(import.meta.env.VITE_API_ORIGIN || '');
  if (single) {
    if (single === '/api') return ['/api'];
    return dedupe([single, ...DEFAULT_API_BASES.filter((b) => b !== single)]);
  }

  if (import.meta.env.DEV) {
    return ['/api'];
  }

  return [...DEFAULT_API_BASES];
}

/** Currently selected API base (sticky for the browser session; defaults to primary). */
export function getActiveApiBaseUrl() {
  const candidates = getApiBaseCandidates();
  if (candidates.length === 1) return candidates[0];

  try {
    const stored = normalizeApiBase(sessionStorage.getItem(STORAGE_KEY) || '');
    // Prefer primary when it was previously selected or when nothing is stored.
    if (stored && candidates.includes(stored)) {
      if (stored === candidates[0]) return stored;
      // Backup was sticky — still report it for asset URLs until the next successful request.
      return stored;
    }
  } catch {
    /* private mode */
  }

  return candidates[0];
}

/** Reset sticky origin to the primary API (custom domain). */
export function preferPrimaryApiBase() {
  const candidates = getApiBaseCandidates();
  if (candidates.length) setActiveApiBaseUrl(candidates[0]);
}

export function setActiveApiBaseUrl(base) {
  const normalized = normalizeApiBase(base);
  if (!normalized) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
}

/** @deprecated Use getActiveApiBaseUrl — kept for existing imports. */
export function resolveApiBaseUrl() {
  return getActiveApiBaseUrl();
}

export function getNextApiBaseUrl(current) {
  const candidates = getApiBaseCandidates();
  if (candidates.length < 2) return null;
  const cur = normalizeApiBase(current || getActiveApiBaseUrl());
  const idx = candidates.indexOf(cur);
  if (idx === -1) return candidates[0];
  return candidates[idx + 1] ?? null;
}

/** User-facing copy when a request times out or the network is unavailable. */
export const INTERNET_CONNECTION_RETRY_MESSAGE =
  'Check your internet connection and retry.';

/** Errors that should trigger a switch to the backup API. */
export function isRetryableApiError(err) {
  if (!err?.config) return false;
  if (err.config._failoverExhausted) return false;

  const code = String(err.code || '');
  if (['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ERR_CANCELED'].includes(code)) {
    return true;
  }
  if (/timeout/i.test(String(err.message || ''))) return true;
  if (/network error/i.test(String(err.message || ''))) return true;

  const status = err.response?.status;
  if (status && [408, 502, 503, 504].includes(status)) return true;

  return false;
}

export function isCanceledRequestError(err) {
  const code = String(err?.code || '');
  if (code === 'ERR_CANCELED') return true;
  if (err?.name === 'CanceledError') return true;
  if (err?.name === 'AbortError') return true;
  return false;
}

/**
 * Try API bases in priority order (primary first). Backup is only used after primary fails.
 * @param {import('axios').InternalAxiosRequestConfig} config
 * @param {string[]} candidates
 * @param {(config: import('axios').InternalAxiosRequestConfig) => Promise<import('axios').AxiosResponse>} dispatch
 */
export async function dispatchWithApiFailover(config, candidates, dispatch) {
  const bases = dedupe(candidates.map((base) => normalizeApiBase(base)).filter(Boolean));
  if (bases.length < 2) {
    return dispatch({ ...config, _parallelRaceSingle: true });
  }

  let lastError;
  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const isLast = i === bases.length - 1;
    try {
      const response = await dispatch({
        ...config,
        baseURL: base,
        _parallelRaceBase: base,
        _parallelRaceSingle: true,
      });
      setActiveApiBaseUrl(base);
      return response;
    } catch (error) {
      if (isCanceledRequestError(error)) throw error;
      lastError = error;
      if (!isLast && isRetryableApiError(error)) continue;
      throw error;
    }
  }

  throw lastError || new Error('All API origins failed');
}

/** @deprecated Use dispatchWithApiFailover — parallel racing favored the fastest host, not the primary. */
export function raceAcrossApiBases(config, candidates, dispatch) {
  return dispatchWithApiFailover(config, candidates, dispatch);
}

/** GET /health lives on the server root (not under /api). */
export function healthCheckUrl(apiBase) {
  if (apiBase === '/api') return null;
  const origin = apiBase.replace(/\/api\/?$/i, '');
  return `${origin}/health`;
}

export async function probeApiBase(apiBase, { timeoutMs = 5000 } = {}) {
  const url = healthCheckUrl(apiBase);
  if (!url) return { base: apiBase, ok: true, ms: 0 };

  const start = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
    });
    const ok = res.ok;
    return { base: apiBase, ok, ms: performance.now() - start };
  } catch {
    return { base: apiBase, ok: false, ms: performance.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * On app load, pick the first healthy origin in priority order (primary first).
 * Skipped in dev when only /api proxy is configured.
 */
export async function initApiFailover() {
  const candidates = getApiBaseCandidates();
  if (candidates.length < 2 || candidates[0] === '/api') return getActiveApiBaseUrl();

  const results = await Promise.all(candidates.map((base) => probeApiBase(base)));
  const healthyByBase = new Map(results.filter((r) => r.ok).map((r) => [r.base, r]));

  for (const base of candidates) {
    if (healthyByBase.has(base)) {
      setActiveApiBaseUrl(base);
      return base;
    }
  }

  preferPrimaryApiBase();
  return getActiveApiBaseUrl();
}

export function isNetworkOrTimeoutError(err) {
  if (!err) return false;

  const code = String(err.code || '');
  if (['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(code)) return true;

  const message = String(err.message || '');
  if (/timeout/i.test(message)) return true;
  if (/network error/i.test(message)) return true;
  if (/failed to fetch/i.test(message)) return true;

  const status = Number(err.response?.status);
  if ([408, 502, 503, 504].includes(status)) return true;

  return false;
}

export function friendlyApiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (isNetworkOrTimeoutError(err)) {
    return INTERNET_CONNECTION_RETRY_MESSAGE;
  }

  const raw =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    '';
  const text = String(raw).trim();

  if (/timeout/i.test(text) || /network error/i.test(text) || /failed to fetch/i.test(text)) {
    return INTERNET_CONNECTION_RETRY_MESSAGE;
  }

  return text || fallback;
}

/** Map axios/network failures to a user-facing message. */
export function describeApiFailure(err) {
  if (err?.response) {
    const msg = err.response.data?.message || err.response.data?.error;
    if (msg) {
      const text = String(msg).trim();
      if (/timeout/i.test(text)) return INTERNET_CONNECTION_RETRY_MESSAGE;
      return text;
    }
    if (err.response.status === 401) return 'Invalid username or password.';
    if (err.response.status === 400) return 'Missing username or password.';
    if ([408, 502, 503, 504].includes(Number(err.response.status))) {
      return INTERNET_CONNECTION_RETRY_MESSAGE;
    }
    return 'Login failed. Please try again.';
  }

  return friendlyApiErrorMessage(err, INTERNET_CONNECTION_RETRY_MESSAGE);
}
