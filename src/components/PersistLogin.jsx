import { useEffect } from 'react';
import useAuth from '../hooks/useAuth';
import useRefreshToken from '../hooks/useRefreshToken';
import LoadingOverlay from './LoadingOverlay';
import { getAccessToken } from '../api/axios';
import { loadAuthSnapshot } from '../api/authSnapshot';
import { getRole, hasActiveSession } from '../api/session';
import { getUserIdFromAccessToken, getUsernameFromAccessToken } from '../utils/jwtUser';

function isTabActive() {
  if (typeof document === 'undefined') return true;
  const visible = document.visibilityState === 'visible';
  const focused = typeof document.hasFocus !== 'function' ? true : document.hasFocus();
  return visible && focused;
}

function tokenExpMs(accessToken) {
  try {
    const part = String(accessToken || '').split('.')[1];
    if (!part) return 0;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return 0;
    return exp * 1000;
  } catch {
    return 0;
  }
}

/**
 * Never hide the login screen behind a refresh spinner. Restore tokens from storage
 * synchronously and run `/refresh` in the background when needed.
 */
export default function PersistLogin({ children }) {
  const { auth, setAuth, isLoggingOut } = useAuth();
  const refresh = useRefreshToken();

  useEffect(() => {
    let mounted = true;

    if (auth?.accessToken) {
      return () => {
        mounted = false;
      };
    }

    const persistedToken = getAccessToken();
    if (persistedToken) {
      const snapshot = loadAuthSnapshot();
      const fromJwtId = getUserIdFromAccessToken(persistedToken);
      const fromJwtName = getUsernameFromAccessToken(persistedToken);
      if (mounted) {
        setAuth((prev) => ({
          ...prev,
          ...snapshot,
          accessToken: persistedToken,
          userId: snapshot?.userId || fromJwtId || prev?.userId,
          user: snapshot?.user || fromJwtName || prev?.user,
          role: snapshot?.role || getRole() || prev?.role || null,
          roles: snapshot?.roles ?? prev?.roles,
          accountStatus: snapshot?.accountStatus ?? prev?.accountStatus,
          whatsappNumber: snapshot?.whatsappNumber ?? prev?.whatsappNumber,
          businessAddress: snapshot?.businessAddress ?? prev?.businessAddress,
        }));
      }
      const r = String(snapshot?.role || getRole() || '').toLowerCase();
      const uid = snapshot?.userId || fromJwtId;
      if ((r === 'wholesaler' || r === 'wholesale') && uid && snapshot?.accountStatus == null) {
        refresh().catch(() => {});
      }
      return () => {
        mounted = false;
      };
    }

    if (hasActiveSession()) {
      refresh().catch(() => {});
    }

    return () => {
      mounted = false;
    };
  }, [auth?.accessToken, refresh, setAuth]);

  useEffect(() => {
    if (!auth?.accessToken) return undefined;
    let stopped = false;
    let refreshing = false;

    const maybeRefresh = async () => {
      if (stopped || refreshing) return;
      if (!isTabActive()) return;
      const token = getAccessToken() || auth?.accessToken;
      const expMs = tokenExpMs(token);
      if (!expMs) return;
      const msLeft = expMs - Date.now();
      // Refresh before expiry while user is active on this tab.
      if (msLeft > 120000) return;
      refreshing = true;
      try {
        await refresh();
      } catch {
        // Keep session state while active; request-level handlers will retry.
      } finally {
        refreshing = false;
      }
    };

    const onActiveEvent = () => {
      maybeRefresh().catch(() => {});
    };

    const intervalId = window.setInterval(() => {
      maybeRefresh().catch(() => {});
    }, 30000);

    window.addEventListener('focus', onActiveEvent);
    document.addEventListener('visibilitychange', onActiveEvent);
    window.addEventListener('pointerdown', onActiveEvent, { passive: true });
    window.addEventListener('keydown', onActiveEvent);

    maybeRefresh().catch(() => {});

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onActiveEvent);
      document.removeEventListener('visibilitychange', onActiveEvent);
      window.removeEventListener('pointerdown', onActiveEvent);
      window.removeEventListener('keydown', onActiveEvent);
    };
  }, [auth?.accessToken, refresh]);

  return (
    <>
      <LoadingOverlay
        show={isLoggingOut}
        ariaLabel="Signing out"
        caption="Signing out…"
      />
      {children}
    </>
  );
}
