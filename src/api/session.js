const ROLE_KEY = 'wache_role';
const SESSION_KEY = 'wache_has_session';

export const setRole = (role) => {
  try {
    if (role) localStorage.setItem(ROLE_KEY, String(role));
  } catch {}
};

export const getRole = () => {
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch {
    return null;
  }
};

export const clearRole = () => {
  try {
    localStorage.removeItem(ROLE_KEY);
  } catch {}
};

export const markSession = () => {
  try {
    localStorage.setItem(SESSION_KEY, '1');
  } catch {}
};

export const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
};

export const hasActiveSession = () => {
  try {
    return !!localStorage.getItem(SESSION_KEY);
  } catch {
    return false;
  }
};

export function rolesFromAuthBody(data) {
  const role = data?.role ?? data?.user?.role ?? data?.data?.role ?? data?.data?.user?.role ?? null;
  const roles = Array.isArray(data?.roles) ? data.roles : role ? [role] : [];
  const normalizedRoles = roles.map((r) => String(r).toLowerCase());
  return { normalizedRoles, primaryRole: normalizedRoles[0] ?? null };
}
