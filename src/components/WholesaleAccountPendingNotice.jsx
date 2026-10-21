import { useCallback, useEffect, useState } from 'react';
import useAuth from '../hooks/useAuth';
import useWholesaleAccess from '../hooks/useWholesaleAccess';
import './WholesaleAccountPendingNotice.css';

function storageKeyFor(userId) {
  return `wache_dismiss_wholesale_pending:${userId || '_'}`;
}

export default function WholesaleAccountPendingNotice() {
  const { auth } = useAuth();
  const { isWholesaler, canPlaceOrders } = useWholesaleAccess();
  const uid = auth?.userId;
  const key = storageKeyFor(uid);

  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage === 'undefined') return;
    setDismissed(sessionStorage.getItem(key) === '1');
  }, [key]);

  const onDismiss = useCallback(() => {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* ignore quota / private mode */
    }
    setDismissed(true);
  }, [key]);

  const show = isWholesaler && !canPlaceOrders && !dismissed;
  if (!show) return null;

  return (
    <div className="wholesale-pending-notice" role="status" aria-live="polite">
      <div className="wholesale-pending-notice__inner">
        <span className="wholesale-pending-notice__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
          </svg>
        </span>
        <p className="wholesale-pending-notice__text">
          <strong>Account pending.</strong> Your vendor profile is not verified yet. An administrator must activate it
          before you can check out or place orders. You can still browse the catalog and use your cart.
        </p>
        <button type="button" className="wholesale-pending-notice__close" onClick={onDismiss} aria-label="Dismiss notice">
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
