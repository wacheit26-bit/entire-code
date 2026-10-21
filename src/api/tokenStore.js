const ACCESS_TOKEN_KEY = 'wache_access_token';

function readStoredToken() {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

let accessToken = readStoredToken();

export const setAccessToken = (token) => {
  accessToken = token || '';
  try {
    if (accessToken) localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    else localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
};

export const getAccessToken = () => accessToken;

export const clearAccessToken = () => {
  accessToken = '';
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
};
