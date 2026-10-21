import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAuth from './useAuth';
import useAxiosPrivate from './useAxiosPrivate';
import { getRole } from '../api/session';
import { fetchOwnProfile, fetchUserById, parseMeProfile } from '../api/authProfile';
import {
  fetchNotifications,
  notificationQueryForRole,
  patchNotificationRead,
  patchNotificationsMarkAllRead,
} from '../api/notificationsApi';
import { subscribeOrderCreated } from '../utils/orderCreatedEvents';
import { getUserIdFromAccessToken } from '../utils/jwtUser';

/** Admin / sales: keep header badges fresh when orders are placed from other devices (no BroadcastChannel). */
const STAFF_INBOX_POLL_MS = 45000;

function normalizeAddress(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function addressesMatch(a, b) {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.includes(right) || right.includes(left);
}

function isOrderLikeNotification(n) {
  const type = String(n?.type || n?.notificationType || n?.category || '').toLowerCase();
  const orderType = String(n?.orderType || n?.order?.orderType || n?.orderId?.orderType || '').toLowerCase();
  const text = `${n?.title || ''} ${n?.message || ''} ${n?.body || ''}`.toLowerCase();
  return (
    type.includes('order') ||
    orderType === 'buy' ||
    text.includes('order') ||
    text.includes('buy request')
  );
}

function notificationAddresses(n) {
  return [
    n?.__resolvedBusinessAddress,
    n?.businessAddress,
    n?.deliveryAddress,
    n?.user?.businessAddress,
    n?.user?.deliveryAddress,
    n?.userId?.businessAddress,
    n?.userId?.deliveryAddress,
    n?.order?.businessAddress,
    n?.order?.deliveryAddress,
    n?.order?.deliveryInfo?.deliveryAddress,
    n?.orderId?.businessAddress,
    n?.orderId?.deliveryAddress,
    n?.orderId?.deliveryInfo?.deliveryAddress,
    n?.payload?.businessAddress,
    n?.payload?.deliveryAddress,
    n?.data?.businessAddress,
    n?.data?.deliveryAddress,
    n?.meta?.businessAddress,
    n?.meta?.deliveryAddress,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

function notificationUserId(n) {
  const raw = n?.userId ?? n?.user ?? n?.requester ?? n?.order?.userId ?? n?.orderId?.userId;
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') return String(raw);
  return String(raw?._id ?? raw?.id ?? raw?.userId ?? '').trim();
}

function filterSalesNotificationsByAddress(items, salesAddress) {
  const own = String(salesAddress || '').trim();
  if (!own) return [];
  return items.filter((n) => {
    const addresses = notificationAddresses(n);
    if (addresses.length > 0) {
      return addresses.some((addr) => addressesMatch(addr, own));
    }
    // For order-related notifications with no address payload, hide to avoid leakage.
    if (isOrderLikeNotification(n)) return false;
    return true;
  });
}

export default function useNotificationsInbox() {
  const { auth } = useAuth();
  const axiosPrivate = useAxiosPrivate();
  const role = auth?.role || getRole() || null;
  const resolvedUserId = useMemo(() => {
    const direct = String(auth?.userId ?? '').trim();
    if (direct) return direct;
    const fromJwt = getUserIdFromAccessToken(auth?.accessToken);
    return fromJwt != null && fromJwt !== '' ? String(fromJwt).trim() : '';
  }, [auth?.userId, auth?.accessToken]);
  const query = useMemo(() => notificationQueryForRole(role, resolvedUserId), [role, resolvedUserId]);
  const canFetch = Boolean(auth?.accessToken && query);
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [salesBusinessAddress, setSalesBusinessAddress] = useState('');
  const userAddressCacheRef = useRef(new Map());

  useEffect(() => {
    let alive = true;
    const normalizedRole = String(role || '').toLowerCase();
    if (normalizedRole !== 'salesman' || !auth?.accessToken || !auth?.userId) {
      setSalesBusinessAddress('');
      return undefined;
    }
    (async () => {
      try {
        const raw = await fetchOwnProfile(axiosPrivate, auth.userId);
        const profile = parseMeProfile(raw);
        if (!alive) return;
        setSalesBusinessAddress(String(profile?.businessAddress || '').trim());
      } catch {
        if (!alive) return;
        setSalesBusinessAddress('');
      }
    })();
    return () => {
      alive = false;
    };
  }, [role, auth?.accessToken, auth?.userId, axiosPrivate]);

  const refetch = useCallback(async () => {
    if (!canFetch) return undefined;
    const { data, unreadCount: unread } = await fetchNotifications(axiosPrivate, query);
    const normalizedRole = String(role || '').toLowerCase();
    let rows = Array.isArray(data) ? data : [];
    if (normalizedRole === 'salesman') {
      const idsToResolve = [...new Set(rows
        .filter((n) => notificationAddresses(n).length === 0 && isOrderLikeNotification(n))
        .map((n) => notificationUserId(n))
        .filter(Boolean))];

      if (idsToResolve.length > 0) {
        await Promise.all(
          idsToResolve.map(async (id) => {
            if (userAddressCacheRef.current.has(id)) return;
            try {
              const rawUser = await fetchUserById(axiosPrivate, id);
              const profile = parseMeProfile(rawUser);
              userAddressCacheRef.current.set(id, String(profile?.businessAddress || '').trim());
            } catch {
              userAddressCacheRef.current.set(id, '');
            }
          }),
        );
      }

      rows = rows.map((n) => {
        const uid = notificationUserId(n);
        const resolved = uid ? userAddressCacheRef.current.get(uid) : '';
        return resolved
          ? { ...n, __resolvedBusinessAddress: resolved }
          : n;
      });
    }
    const visible =
      normalizedRole === 'salesman'
        ? filterSalesNotificationsByAddress(rows, salesBusinessAddress)
        : rows;
    setItems(visible);
    if (normalizedRole === 'salesman') {
      const localUnread = visible.filter((n) => !(n?.read === true || n?.isRead === true)).length;
      setUnreadCount(localUnread);
    } else {
      setUnreadCount(unread);
    }
  }, [canFetch, axiosPrivate, query, role, salesBusinessAddress]);

  useEffect(() => {
    refetch().catch(() => {});
  }, [refetch]);

  useEffect(() => {
    if (!canFetch) return undefined;
    const r = String(role || '').toLowerCase();
    return subscribeOrderCreated((orderType) => {
      if ((orderType === 'offer' || orderType === 'preorder') && r === 'admin') {
        refetch().catch(() => {});
        return;
      }
      if (orderType === 'buy' && r === 'salesman') {
        refetch().catch(() => {});
        return;
      }
      if (
        (r === 'wholesaler' || r === 'wholesale') &&
        (orderType === 'buy' || orderType === 'offer' || orderType === 'preorder')
      ) {
        refetch().catch(() => {});
      }
    });
  }, [canFetch, role, refetch]);

  useEffect(() => {
    if (!canFetch) return undefined;
    const r = String(role || '').toLowerCase();
    if (r !== 'admin' && r !== 'salesman') return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      refetch().catch(() => {});
    };
    const intervalId = window.setInterval(tick, STAFF_INBOX_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [canFetch, role, refetch]);

  const markRead = useCallback(
    async (id) => {
      if (!canFetch || id == null) return;
      try {
        await patchNotificationRead(axiosPrivate, id);
        await refetch();
      } catch {
        /* ignore */
      }
    },
    [canFetch, axiosPrivate, refetch],
  );

  const markAllRead = useCallback(async () => {
    if (!canFetch) return undefined;
    const body = {};
    if (query?.userId) body.userId = String(query.userId);
    else if (query?.audience) body.audience = String(query.audience);
    await patchNotificationsMarkAllRead(axiosPrivate, body);
    await refetch();
  }, [canFetch, axiosPrivate, refetch, query]);

  return { items, unreadCount, refetch, markRead, markAllRead, canFetch };
}
