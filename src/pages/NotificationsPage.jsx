import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import { useNotificationInbox } from '../context/NotificationInboxContext';
import { getRole } from '../api/session';
import { fetchOfferOrders, patchOrderAccept, patchOrderReject } from '../api/ordersListApi';
import { subscribeOrderCreated } from '../utils/orderCreatedEvents';
import { OfferAcceptDialog, OfferRejectDialog } from '../components/OfferOrderDialogs';
import MoneyXaf from '../components/MoneyXaf';
import { localizeUsdAmountsInNotificationText } from '../utils/localizeNotificationCurrency';
import './NotificationsPage.css';

const NOTIFICATIONS_PAGE_SIZE = 6;

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function orderId(o) {
  return String(o._id ?? o.id ?? '');
}

function productLabel(o) {
  return o.productName || o.productId?.product_name || 'Product';
}

function normalizeOfferTab(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'accepted' || s === 'approved') return 'accepted';
  if (s === 'rejected') return 'rejected';
  return 'received';
}

function normalizeInboxTab(notification) {
  const direct = String(notification?.status || notification?.type || '').toLowerCase();
  const text = `${notification?.title || ''} ${notification?.message || notification?.body || ''}`.toLowerCase();
  if (direct.includes('reject') || text.includes('reject')) return 'rejected';
  if (direct.includes('accept') || direct.includes('approv') || text.includes('accept') || text.includes('approv')) {
    return 'accepted';
  }
  return 'received';
}

function OfferOrderCard({
  order,
  read,
  onMarkRead,
  canReview,
  isProcessing,
  actionError,
  onAccept,
  onReject,
}) {
  const id = orderId(order);
  const name = productLabel(order);
  const qty = Number(order.quantity) || 0;
  const offered = order.offeredPrice ?? order.offerAmount ?? 0;
  const status = order.status ?? '—';

  return (
    <article className={`notif-offer-card ${!read ? 'notif-offer-card--unread' : ''}`}>
      <header className="notif-offer-card__head">
        <h3 className="notif-offer-card__title">New Price Offer</h3>
        {!read && id && (
          <button type="button" className="notif-btn notif-btn--ghost" onClick={() => onMarkRead(id)}>
            Mark read
          </button>
        )}
      </header>
      <p className="notif-offer-card__summary">
        {name} — Quantity: {qty}, Offered: <MoneyXaf value={offered} />
      </p>
      <div className="notif-offer-card__grid">
        <div className="notif-offer-card__cell">
          <span className="notif-offer-card__label">Product</span>
          <span className="notif-offer-card__value">{name}</span>
        </div>
        <div className="notif-offer-card__cell">
          <span className="notif-offer-card__label">Type</span>
          <span className="notif-offer-card__value">{order.orderType || 'offer'}</span>
        </div>
        <div className="notif-offer-card__cell">
          <span className="notif-offer-card__label">Qty</span>
          <span className="notif-offer-card__value">{qty}</span>
        </div>
      </div>
      <div className="notif-offer-card__status-block">
        <span className="notif-offer-card__label">Status</span>
        <strong className="notif-offer-card__status">{status}</strong>
      </div>
      {canReview && (
        <div className="notif-offer-card__actions">
          <button type="button" className="notif-btn notif-btn--primary" disabled={isProcessing} onClick={() => onAccept?.(order)}>
            {isProcessing ? 'Processing…' : 'Accept'}
          </button>
          <button type="button" className="notif-btn notif-btn--danger" disabled={isProcessing} onClick={() => onReject?.(order)}>
            Reject
          </button>
        </div>
      )}
      {actionError ? (
        <p className="notif-offer-card__action-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {order.createdAt && (
        <time className="notif-offer-card__time" dateTime={order.createdAt}>
          {formatDateTime(order.createdAt)}
        </time>
      )}
    </article>
  );
}

function InboxAlertCard({ n, onMarkRead }) {
  const id = n._id ?? n.id;
  const read = n.read === true || n.isRead === true;
  const rawTitle = n.title || 'Notification';
  const title = localizeUsdAmountsInNotificationText(rawTitle);
  const rawBody = n.message || n.body || n.description || '—';
  const body = localizeUsdAmountsInNotificationText(rawBody);

  return (
    <article className={`notif-offer-card notif-offer-card--inbox ${!read ? 'notif-offer-card--unread' : ''}`}>
      <header className="notif-offer-card__head">
        <h3 className="notif-offer-card__title">{title}</h3>
        {!read && id != null && (
          <button type="button" className="notif-btn notif-btn--ghost" onClick={() => onMarkRead(id)}>
            Mark read
          </button>
        )}
      </header>
      <p className="notif-offer-card__summary">{body}</p>
      {n.createdAt && (
        <time className="notif-offer-card__time" dateTime={n.createdAt}>
          {formatDateTime(n.createdAt)}
        </time>
      )}
    </article>
  );
}

export default function NotificationsPage({ stickyUnderAppHeader = false }) {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const axiosPrivate = useAxiosPrivate();
  const role = auth?.role || getRole();
  const { items: inboxItems, refetch, markRead, markAllRead, canFetch } = useNotificationInbox();

  const [offers, setOffers] = useState([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState('');
  const [actionInfo, setActionInfo] = useState('');
  const [orderBusyId, setOrderBusyId] = useState('');
  const [orderActionErrors, setOrderActionErrors] = useState({});
  const [pendingAcceptOrder, setPendingAcceptOrder] = useState(null);
  const [pendingRejectOrder, setPendingRejectOrder] = useState(null);
  const [activeTab, setActiveTab] = useState('received');
  const [visibleOffersCount, setVisibleOffersCount] = useState(NOTIFICATIONS_PAGE_SIZE);
  const [visibleInboxCount, setVisibleInboxCount] = useState(NOTIFICATIONS_PAGE_SIZE);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [markAllReadBusy, setMarkAllReadBusy] = useState(false);
  const [toolbarError, setToolbarError] = useState('');

  const offerReadKey = useMemo(
    () => `wache-offer-read:${auth?.userId || role || 'default'}`,
    [auth?.userId, role],
  );

  const [readOfferIds, setReadOfferIds] = useState([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(offerReadKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setReadOfferIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setReadOfferIds([]);
    }
  }, [offerReadKey]);

  const isOfferRead = useCallback(
    (id) => readOfferIds.includes(String(id)),
    [readOfferIds],
  );

  const markOfferRead = useCallback((id) => {
    const s = String(id);
    setReadOfferIds((prev) => {
      if (prev.includes(s)) return prev;
      const next = [...prev, s];
      try {
        localStorage.setItem(offerReadKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [offerReadKey]);

  const markAllOffersRead = useCallback(() => {
    const ids = offers.map((o) => orderId(o)).filter(Boolean);
    setReadOfferIds((prev) => {
      const next = [...new Set([...prev, ...ids])];
      try {
        localStorage.setItem(offerReadKey, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [offers, offerReadKey]);

  const loadOffers = useCallback(async () => {
    if (role !== 'admin') {
      setOffers([]);
      return;
    }
    setOffersLoading(true);
    setOffersError('');
    try {
      const rows = await fetchOfferOrders(axiosPrivate);
      setOffers(rows);
    } catch (e) {
      setOffersError(e?.response?.data?.message || e?.message || 'Could not load offer orders.');
      setOffers([]);
    } finally {
      setOffersLoading(false);
    }
  }, [role, axiosPrivate]);

  useEffect(() => {
    loadOffers();
  }, [loadOffers]);

  useEffect(() => {
    if (String(role || '').toLowerCase() !== 'admin') return undefined;
    return subscribeOrderCreated((orderType) => {
      if (orderType === 'offer') loadOffers().catch(() => {});
    });
  }, [role, loadOffers]);

  const handleBack = () => {
    if (role === 'admin') navigate('/admin');
    else if (role === 'salesman') navigate('/sales');
    else navigate('/');
  };

  const handleRefresh = async () => {
    if (refreshBusy) return;
    setRefreshBusy(true);
    setToolbarError('');
    try {
      await Promise.all([loadOffers(), refetch()]);
    } catch (e) {
      setToolbarError(
        e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Could not refresh notifications.',
      );
    } finally {
      setRefreshBusy(false);
    }
  };

  const setOrderError = useCallback((id, message) => {
    setOrderActionErrors((prev) => ({ ...prev, [String(id)]: message }));
  }, []);

  const clearOrderError = useCallback((id) => {
    setOrderActionErrors((prev) => {
      const next = { ...prev };
      delete next[String(id)];
      return next;
    });
  }, []);

  const submitAcceptFromDialog = useCallback(
    async ({ finalPrice, staffNotes, estimatedDeliveryDate }) => {
      const order = pendingAcceptOrder;
      if (!order || !auth?.userId) return;
      const id = orderId(order);
      const payload = { handledById: auth.userId };
      const parsedFinalPrice = Number(finalPrice);
      if (finalPrice.trim() !== '' && Number.isFinite(parsedFinalPrice)) payload.finalPrice = parsedFinalPrice;
      if (staffNotes.trim()) payload.staffNotes = staffNotes.trim();
      if (estimatedDeliveryDate.trim()) payload.estimatedDeliveryDate = estimatedDeliveryDate.trim();

      setOrderBusyId(id);
      clearOrderError(id);
      setActionInfo('');
      try {
        await patchOrderAccept(axiosPrivate, id, payload);
        markOfferRead(id);
        setPendingAcceptOrder(null);
        setActionInfo('Order accepted. The requester will get a notification update.');
        await Promise.all([loadOffers(), refetch?.()].filter(Boolean));
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || 'Failed to accept order.';
        setOrderError(id, msg);
      } finally {
        setOrderBusyId('');
      }
    },
    [pendingAcceptOrder, auth?.userId, axiosPrivate, clearOrderError, loadOffers, markOfferRead, refetch, setOrderError],
  );

  const submitRejectFromDialog = useCallback(
    async ({ rejectionReason, staffNotes }) => {
      const order = pendingRejectOrder;
      if (!order || !auth?.userId) return;
      const id = orderId(order);
      if (!rejectionReason?.trim()) {
        setOrderError(id, 'Rejection reason is required.');
        return;
      }
      const payload = {
        handledById: auth.userId,
        rejectionReason: rejectionReason.trim(),
      };
      if (staffNotes.trim()) payload.staffNotes = staffNotes.trim();

      setOrderBusyId(id);
      clearOrderError(id);
      setActionInfo('');
      try {
        await patchOrderReject(axiosPrivate, id, payload);
        markOfferRead(id);
        setPendingRejectOrder(null);
        setActionInfo('Order rejected. The requester will get a rejection notification.');
        await Promise.all([loadOffers(), refetch?.()].filter(Boolean));
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || 'Failed to reject order.';
        setOrderError(id, msg);
      } finally {
        setOrderBusyId('');
      }
    },
    [pendingRejectOrder, auth?.userId, axiosPrivate, clearOrderError, loadOffers, markOfferRead, refetch, setOrderError],
  );

  const handleMarkAllRead = async () => {
    if (markAllReadBusy) return;
    setMarkAllReadBusy(true);
    setToolbarError('');
    try {
      if (role === 'admin') markAllOffersRead();
      if (canFetch) {
        await markAllRead();
      } else if (role !== 'admin') {
        setToolbarError('Your session could not load the inbox. Try signing in again, then mark all as read.');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message;
      const list = e?.response?.data?.errors;
      const joined = Array.isArray(list) ? list.join(' ') : '';
      setToolbarError(String(msg || joined || 'Could not mark all notifications as read.').trim());
    } finally {
      setMarkAllReadBusy(false);
    }
  };

  const isAdmin = role === 'admin';
  const subtitle = isAdmin ? 'Offer orders and admin alerts' : 'Your notifications';

  const offersByTab = useMemo(
    () => ({
      received: offers.filter((o) => normalizeOfferTab(o.status) === 'received'),
      accepted: offers.filter((o) => normalizeOfferTab(o.status) === 'accepted'),
      rejected: offers.filter((o) => normalizeOfferTab(o.status) === 'rejected'),
    }),
    [offers],
  );
  const inboxByTab = useMemo(
    () => ({
      received: inboxItems.filter((n) => normalizeInboxTab(n) === 'received'),
      accepted: inboxItems.filter((n) => normalizeInboxTab(n) === 'accepted'),
      rejected: inboxItems.filter((n) => normalizeInboxTab(n) === 'rejected'),
    }),
    [inboxItems],
  );
  const tabItems = useMemo(() => {
    const base = [
      {
        key: 'received',
        label: 'Received',
        count: (isAdmin ? offersByTab.received.length : 0) + (canFetch ? inboxByTab.received.length : 0),
      },
      {
        key: 'accepted',
        label: 'Accepted',
        count: (isAdmin ? offersByTab.accepted.length : 0) + (canFetch ? inboxByTab.accepted.length : 0),
      },
      {
        key: 'rejected',
        label: 'Rejected',
        count: (isAdmin ? offersByTab.rejected.length : 0) + (canFetch ? inboxByTab.rejected.length : 0),
      },
    ];
    return base;
  }, [canFetch, inboxByTab.accepted.length, inboxByTab.received.length, inboxByTab.rejected.length, isAdmin, offersByTab.accepted.length, offersByTab.received.length, offersByTab.rejected.length]);

  const activeOffers = isAdmin ? offersByTab[activeTab] || [] : [];
  const activeInbox = canFetch ? inboxByTab[activeTab] || [] : [];
  const visibleOffers = activeOffers.slice(0, visibleOffersCount);
  const visibleInbox = activeInbox.slice(0, visibleInboxCount);
  const canLoadMoreOffers = activeOffers.length > visibleOffers.length;
  const canLoadMoreInbox = activeInbox.length > visibleInbox.length;

  const showOffersSection = isAdmin && activeOffers.length > 0;
  const showInboxSection = canFetch && activeInbox.length > 0;
  const showGlobalEmpty =
    !offersLoading &&
    !offersError &&
    !showOffersSection &&
    !showInboxSection;

  useEffect(() => {
    setVisibleOffersCount(NOTIFICATIONS_PAGE_SIZE);
    setVisibleInboxCount(NOTIFICATIONS_PAGE_SIZE);
  }, [activeTab]);

  return (
    <div
      className={
        stickyUnderAppHeader
          ? 'notifications-page notifications-page--under-app-header'
          : 'notifications-page'
      }
    >
      <div className="notifications-page__top">
        <header className="notifications-page__header">
          <div className="notifications-page__header-main">
            <button type="button" className="notifications-page__back" onClick={handleBack}>
              ← Back
            </button>
            <h1 className="notifications-page__title">Notifications</h1>
            <p className="notifications-page__subtitle">{subtitle}</p>
          </div>
          <div className="notifications-page__actions">
            <button
              type="button"
              className={`notif-btn notif-btn--ghost${markAllReadBusy ? ' notif-btn--busy' : ''}`}
              disabled={markAllReadBusy}
              onClick={() => void handleMarkAllRead()}
              aria-busy={markAllReadBusy}
            >
              {markAllReadBusy ? (
                <>
                  <span className="notif-btn__spinner" aria-hidden />
                  <span>Marking…</span>
                </>
              ) : (
                'Mark all read'
              )}
            </button>
            <button
              type="button"
              className={`notif-btn notif-btn--primary${refreshBusy ? ' notif-btn--busy' : ''}`}
              disabled={refreshBusy}
              onClick={() => void handleRefresh()}
              aria-busy={refreshBusy}
            >
              {refreshBusy ? (
                <>
                  <span className="notif-btn__spinner" aria-hidden />
                  <span>Refreshing…</span>
                </>
              ) : (
                'Refresh'
              )}
            </button>
          </div>
        </header>

        <div className="notifications-page__tabs" role="tablist" aria-label="Notification tabs">
          {tabItems.map((t) => {
            const selected = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`notifications-page__tab ${selected ? 'is-active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
                <span className="notifications-page__tab-count">{t.count}</span>
              </button>
            );
          })}
        </div>

        <div className="notifications-page__divider" />
      </div>

      <div className="notifications-page__body">
        {toolbarError ? (
          <p className="notifications-page__toolbar-error" role="alert">
            {toolbarError}
          </p>
        ) : null}
        {actionInfo && <p className="notifications-page__success">{actionInfo}</p>}
        {isAdmin && offersError && (
          <p className="notifications-page__error" role="alert">
            {offersError}
          </p>
        )}

        {isAdmin && offersLoading && <p className="notifications-page__hint">Loading offer requests…</p>}

        {!offersLoading && showOffersSection && (
          <section className="notifications-page__section" aria-label={`${activeTab} offer notifications`}>
            <ul className="notifications-page__list">
              {visibleOffers.map((order, idx) => {
                const id = orderId(order);
                return (
                  <li key={id || `offer-${idx}`}>
                    <OfferOrderCard
                      order={order}
                      read={isOfferRead(id)}
                      onMarkRead={markOfferRead}
                      canReview={isAdmin && String(order.status || '').toLowerCase() === 'pending'}
                      isProcessing={orderBusyId === id}
                      actionError={orderActionErrors[id]}
                      onAccept={() => setPendingAcceptOrder(order)}
                      onReject={() => setPendingRejectOrder(order)}
                    />
                  </li>
                );
              })}
            </ul>
            {canLoadMoreOffers && (
              <div className="notifications-page__more-wrap">
                <button
                  type="button"
                  className="notif-btn notif-btn--ghost"
                  onClick={() => setVisibleOffersCount((n) => n + NOTIFICATIONS_PAGE_SIZE)}
                >
                  Load more
                </button>
              </div>
            )}
          </section>
        )}

        {showInboxSection && (
          <section className="notifications-page__section" aria-label={`${activeTab} inbox notifications`}>
            {isAdmin && showOffersSection && (
              <h2 className="notifications-page__section-title">Other alerts</h2>
            )}
            <ul className="notifications-page__list">
              {visibleInbox.map((n) => (
                <li key={n._id ?? n.id}>
                  <InboxAlertCard n={n} onMarkRead={markRead} />
                </li>
              ))}
            </ul>
            {canLoadMoreInbox && (
              <div className="notifications-page__more-wrap">
                <button
                  type="button"
                  className="notif-btn notif-btn--ghost"
                  onClick={() => setVisibleInboxCount((n) => n + NOTIFICATIONS_PAGE_SIZE)}
                >
                  Load more
                </button>
              </div>
            )}
          </section>
        )}

        {showGlobalEmpty && (
          <p className="notifications-page__empty">
            {!isAdmin && !canFetch
              ? 'Notifications are unavailable for this session.'
              : `No ${activeTab} notifications to show.`}
          </p>
        )}
      </div>

      <OfferAcceptDialog
        order={pendingAcceptOrder}
        open={Boolean(pendingAcceptOrder)}
        busy={Boolean(
          pendingAcceptOrder && orderBusyId && orderId(pendingAcceptOrder) === orderBusyId,
        )}
        onClose={() => {
          if (!orderBusyId) setPendingAcceptOrder(null);
        }}
        onConfirm={(data) => void submitAcceptFromDialog(data)}
      />
      <OfferRejectDialog
        order={pendingRejectOrder}
        open={Boolean(pendingRejectOrder)}
        busy={Boolean(
          pendingRejectOrder && orderBusyId && orderId(pendingRejectOrder) === orderBusyId,
        )}
        onClose={() => {
          if (!orderBusyId) setPendingRejectOrder(null);
        }}
        onConfirm={(data) => void submitRejectFromDialog(data)}
      />
    </div>
  );
}
