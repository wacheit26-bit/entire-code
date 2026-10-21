import { useMemo } from 'react';
import useAuth from './useAuth';
import { getRole } from '../api/session';

export function canWholesalerPlaceOrders(auth) {
  const role = String(auth?.role || getRole() || '').toLowerCase();
  if (role !== 'wholesaler' && role !== 'wholesale') return true;
  return String(auth?.accountStatus || '').toLowerCase() === 'active';
}

export default function useWholesaleAccess() {
  const { auth } = useAuth();
  const canPlaceOrders = useMemo(() => canWholesalerPlaceOrders(auth), [auth]);
  const isWholesaler = useMemo(() => {
    const r = String(auth?.role || getRole() || '').toLowerCase();
    return r === 'wholesaler' || r === 'wholesale';
  }, [auth?.role]);
  return { canPlaceOrders, isWholesaler, accountStatus: auth?.accountStatus ?? null };
}
