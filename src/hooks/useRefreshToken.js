import { useCallback } from 'react';
import useAuth from './useAuth';
import { axiosPrivate, refreshAccessToken, getAccessToken } from '../api/axios';
import { fetchUserById, parseMeProfile } from '../api/authProfile';
import { getRole, clearRole, clearSession } from '../api/session';
import { clearAccessToken } from '../api/tokenStore';
import { getUserIdFromAccessToken } from '../utils/jwtUser';
import { redirectToLoginFast } from '../utils/authRedirect';

function isTabActive() {
  if (typeof document === 'undefined') return true;
  const visible = document.visibilityState === 'visible';
  const focused = typeof document.hasFocus !== 'function' ? true : document.hasFocus();
  return visible && focused;
}

const useRefreshToken = () => {
  const { setAuth } = useAuth();

  const refresh = useCallback(async () => {
    try {
      await refreshAccessToken();
      const role = getRole();
      const accessToken = getAccessToken();
      const userIdFromToken = getUserIdFromAccessToken(accessToken);

      let accountStatus;
      const r = String(role || '').toLowerCase();
      if ((r === 'wholesaler' || r === 'wholesale') && userIdFromToken) {
        try {
          const raw = await fetchUserById(axiosPrivate, userIdFromToken);
          accountStatus = parseMeProfile(raw)?.accountStatus;
        } catch {
          /* keep prior auth.accountStatus */
        }
      }

      setAuth((prev) => {
        const next = {
          ...prev,
          accessToken,
          userId: userIdFromToken || prev?.userId,
          role: role || prev?.role || null,
          roles: role ? [role] : prev?.roles || [],
        };
        if (accountStatus !== undefined) next.accountStatus = accountStatus;
        return next;
      });
      return accessToken;
    } catch (err) {
      const status = err?.response?.status;
      const refreshExpired = status === 401 || status === 403;
      if (refreshExpired) {
        clearAccessToken();
        clearRole();
        clearSession();
        setAuth({});
        redirectToLoginFast('Your session expired. Please sign in again.');
      } else if (!isTabActive()) {
        // If tab is inactive and refresh failed for non-auth reasons, keep state untouched.
      }
      throw err;
    }
  }, [setAuth]);

  return refresh;
};

export default useRefreshToken;
