import { useEffect, useState } from 'react';
import { AppModal } from './AppDialog';
import './OfferOrderDialogs.css';

function orderLabel(o) {
  return o?.productName || o?.productId?.product_name || 'Product';
}

/** Replaces chained window.prompt calls for admin offer acceptance. */
export function OfferAcceptDialog({ order, open, onClose, onConfirm, busy = false }) {
  const [finalPrice, setFinalPrice] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');

  useEffect(() => {
    if (!open || !order) return;
    setFinalPrice(String(order.offeredPrice ?? order.offerAmount ?? ''));
    setStaffNotes('');
    setEstimatedDeliveryDate('');
  }, [open, order]);

  if (!order) return null;

  const name = orderLabel(order);

  const handleSubmit = () => {
    onConfirm?.({
      finalPrice: finalPrice.trim(),
      staffNotes: staffNotes.trim(),
      estimatedDeliveryDate: estimatedDeliveryDate.trim(),
    });
  };

  return (
    <AppModal
      open={open}
      title="Accept offer"
      wide
      onClose={onClose}
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="app-dialog__btn app-dialog__btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="app-dialog__btn app-dialog__btn--primary" disabled={busy} onClick={handleSubmit}>
            {busy ? 'Saving…' : 'Accept order'}
          </button>
        </>
      }
    >
      <p className="offer-dialog__lead">
        <strong>{name}</strong> — optional details before accepting.
      </p>
      <label className="offer-dialog__field">
        <span>Final price (XAF)</span>
        <input
          type="text"
          inputMode="decimal"
          value={finalPrice}
          onChange={(e) => setFinalPrice(e.target.value)}
          placeholder="Leave as-is to use the offered price"
          disabled={busy}
          autoComplete="off"
        />
        <small>Leave empty or unchanged to keep the customer&apos;s offer price.</small>
      </label>
      <label className="offer-dialog__field">
        <span>Message to customer (optional)</span>
        <textarea
          rows={3}
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
          placeholder="Optional feedback shown to the requester"
          disabled={busy}
        />
      </label>
      <label className="offer-dialog__field">
        <span>Estimated delivery date (optional)</span>
        <input
          type="date"
          value={estimatedDeliveryDate}
          onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
          disabled={busy}
        />
      </label>
    </AppModal>
  );
}

/** Replaces window.prompt for offer rejection. */
export function OfferRejectDialog({ order, open, onClose, onConfirm, busy = false }) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [staffNotes, setStaffNotes] = useState('');

  useEffect(() => {
    if (!open || !order) return;
    setRejectionReason('');
    setStaffNotes('');
  }, [open, order]);

  if (!order) return null;

  const name = orderLabel(order);

  const handleSubmit = () => {
    if (!rejectionReason.trim()) return;
    onConfirm?.({
      rejectionReason: rejectionReason.trim(),
      staffNotes: staffNotes.trim(),
    });
  };

  const canSubmit = rejectionReason.trim().length > 0;

  return (
    <AppModal
      open={open}
      title="Reject offer"
      wide
      onClose={onClose}
      variant="danger"
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="app-dialog__btn app-dialog__btn--ghost" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="app-dialog__btn app-dialog__btn--danger"
            disabled={busy || !canSubmit}
            onClick={handleSubmit}
          >
            {busy ? 'Rejecting…' : 'Reject order'}
          </button>
        </>
      }
    >
      <p className="offer-dialog__lead">
        Reject <strong>{name}</strong>. The customer will be notified.
      </p>
      <label className="offer-dialog__field">
        <span>Reason for rejection (required)</span>
        <textarea
          rows={3}
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Explain why this offer cannot be accepted"
          disabled={busy}
          required
        />
      </label>
      <label className="offer-dialog__field">
        <span>Internal note (optional)</span>
        <textarea
          rows={2}
          value={staffNotes}
          onChange={(e) => setStaffNotes(e.target.value)}
          placeholder="Optional note for your team only"
          disabled={busy}
        />
      </label>
    </AppModal>
  );
}
