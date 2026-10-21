const SNAPSHOT_KEY = 'wache_auth_snapshot';

export function pickAuthSnapshotFields(auth) {
  if (!auth || typeof auth !== 'object') return null;
  return {
    user: auth.user ?? null,
    userId: auth.userId ?? null,
    role: auth.role ?? null,
    roles: Array.isArray(auth.roles) ? auth.roles : null,
    accountStatus: auth.accountStatus ?? null,
    whatsappNumber: auth.whatsappNumber ?? null,
    businessAddress: auth.businessAddress ?? null,
  };
}

export function saveAuthSnapshot(auth) {
  const picked = pickAuthSnapshotFields(auth);
  if (!picked) return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(picked));
  } catch {
    /* ignore */
  }
}

export function loadAuthSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAuthSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* ignore */
  }
}
