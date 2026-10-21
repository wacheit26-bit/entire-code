import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout as logoutRequest } from '../api/axios';
import useAuth from './useAuth';

/**
 * Server logout (POST /api/logout), clear local tokens/session snapshot, reset auth context, go to login.
 * Drives `isLoggingOut` on auth context so the UI can show a full-screen loading state until finished.
 */
export default function useLogout() {
  const navigate = useNavigate();
  const { setAuth, setIsLoggingOut } = useAuth();
  const inFlight = useRef(false);

  return useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsLoggingOut(true);
    try {
      await logoutRequest();
      setAuth({});
      navigate('/login', { replace: true });
    } finally {
      setIsLoggingOut(false);
      inFlight.current = false;
    }
  }, [navigate, setAuth, setIsLoggingOut]);
}
