import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import './OrderFeedbackModal.css';

/**
 * In-app result dialog for buy / order actions (replaces window.alert).
 * @param {'success' | 'error' | 'info'} variant
 */
export default function OrderFeedbackModal({ open, variant = 'info', title, message, onDismiss }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onDismiss?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onDismiss]);

  if (!open || typeof document === 'undefined') return null;

  const v = variant === 'success' || variant === 'error' ? variant : 'info';

  return createPortal(
    <div className="order-feedback-modal-root wache-dialog-light">
      <button
        type="button"
        className="order-feedback-modal__backdrop"
        aria-label="Close dialog"
        onClick={onDismiss}
      />
      <div
        className={`order-feedback-modal order-feedback-modal--${v}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="order-feedback-modal-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="order-feedback-modal__header">
          <h2 id="order-feedback-modal-title" className="order-feedback-modal__title">
            {title}
          </h2>
          <button type="button" className="order-feedback-modal__close" onClick={onDismiss} aria-label="Close">
            <span aria-hidden>×</span>
          </button>
        </header>
        <div className="order-feedback-modal__divider" aria-hidden />
        <div className="order-feedback-modal__body">
          <p className="order-feedback-modal__message">{message}</p>
        </div>
        <div className="order-feedback-modal__divider" aria-hidden />
        <footer className="order-feedback-modal__footer">
          <button
            type="button"
            className={`order-feedback-modal__btn order-feedback-modal__btn--${
              v === 'error' ? 'danger' : v === 'info' ? 'info' : 'primary'
            }`}
            onClick={onDismiss}
          >
            OK
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
