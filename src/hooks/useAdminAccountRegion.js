import { useEffect, useMemo } from 'react';
import useAuth from './useAuth';
import useAxiosPrivate from './useAxiosPrivate';
import { fetchUserById, parseMeProfile } from '../api/authProfile';
import {
  getAdminAccountLabel,
  getAdminAccountRegion,
  isUsaBusinessAddress,
} from '../utils/adminAccountRegion';

export default function useAdminAccountRegion() {
  const { auth, setAuth } = useAuth();
  const axiosPrivate = useAxiosPrivate();
  const businessAddress = String(auth?.businessAddress ?? '').trim();

  useEffect(() => {
    if (String(auth?.role || '').toLowerCase() !== 'admin') return;
    if (!auth?.userId || !auth?.accessToken) return;

    let cancelled = false;
    fetchUserById(axiosPrivate, auth.userId)
      .then((data) => {
        const profile = parseMeProfile(data);
        const next = String(profile?.businessAddress ?? '').trim();
        if (cancelled || !next) return;
        setAuth((prev) => {
          if (String(prev?.businessAddress ?? '').trim() === next) return prev;
          return { ...prev, businessAddress: next };
        });
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [auth?.role, auth?.userId, auth?.accessToken, axiosPrivate, setAuth]);

  return useMemo(
    () => ({
      businessAddress,
      region: getAdminAccountRegion(businessAddress),
      label: getAdminAccountLabel(businessAddress),
      isUsaAccount: isUsaBusinessAddress(businessAddress),
      isCameroonAccount: !isUsaBusinessAddress(businessAddress),
    }),
    [businessAddress],
  );
}
