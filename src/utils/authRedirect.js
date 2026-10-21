import { clearAuthSnapshot } from '../api/authSnapshot';
import { clearAccessToken } from '../api/tokenStore';
import { clearRole, clearSession } from '../api/session';

let redirecting = false;

/** Clear session and hard-navigate to login (fast path when refresh fails). */
export function redirectToLoginFast(notice) {
  if (typeof window === 'undefined') return;
  if (redirecting) return;
  redirecting = true;

  clearAccessToken();
  clearRole();
  clearSession();
  clearAuthSnapshot();

  const path = window.location.pathname || '';
  if (path === '/login' || path.startsWith('/register') || path.startsWith('/forgot-password')) {
    redirecting = false;
    return;
  }

  const params = notice ? `?notice=${encodeURIComponent(notice)}` : '';
  window.location.replace(`/login${params}`);
}

export function resetAuthRedirectGuard() {
  redirecting = false;
}
