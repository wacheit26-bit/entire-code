/**
 * In-memory warehouse dashboard cache for the current admin session.
 * Not persisted to disk — cleared on logout and when another user signs in.
 */

const store = {
  sessionKey: null,
  overview: null,
  error: '',
  usingFallback: false,
  loadedAt: 0,
};

/** Stable per-user key; never cache without a user id. */
export function getWarehouseDashboardCacheKey(userId) {
  const id = String(userId || '').trim();
  return id ? `admin:${id}` : null;
}

export function readWarehouseDashboardCache(sessionKey) {
  if (!sessionKey || store.sessionKey !== sessionKey || !store.overview) {
    return null;
  }
  return {
    overview: store.overview,
    error: store.error,
    usingFallback: store.usingFallback,
    loadedAt: store.loadedAt,
  };
}

export function writeWarehouseDashboardCache(sessionKey, { overview, error = '', usingFallback = false }) {
  if (!sessionKey || !overview) return;
  store.sessionKey = sessionKey;
  store.overview = overview;
  store.error = error;
  store.usingFallback = usingFallback;
  store.loadedAt = Date.now();
}

export function clearWarehouseDashboardCache() {
  store.sessionKey = null;
  store.overview = null;
  store.error = '';
  store.usingFallback = false;
  store.loadedAt = 0;
}

/** Drop cached overview so the next load refetches (e.g. after stock changes). */
export function invalidateWarehouseDashboardCache() {
  store.overview = null;
  store.loadedAt = 0;
}
