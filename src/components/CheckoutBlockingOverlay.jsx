import { createPortal } from 'react-dom';
import './CheckoutBlockingOverlay.css';

/**
 * Full-screen block while cart checkout API calls are in flight.
 * z-index above header/sidebar so no interaction until checkout completes.
 */
export default function CheckoutBlockingOverlay({ active }) {
  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="checkout-block-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-labelledby="checkout-block-overlay-title"
    >
      <div className="checkout-block-overlay__panel">
        <span className="checkout-block-overlay__spinner" aria-hidden />
        <p id="checkout-block-overlay-title" className="checkout-block-overlay__title">
          Submitting your order…
        </p>
        <p className="checkout-block-overlay__hint">Please wait — do not close this page.</p>
      </div>
    </div>,
    document.body,
  );
}
