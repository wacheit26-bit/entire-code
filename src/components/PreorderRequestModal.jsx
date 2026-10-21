import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import './PreorderRequestModal.css';

export default function PreorderRequestModal({
  open,
  onClose,
  initialName = '',
  /** Pre-filled delivery (e.g. profile business address). */
  initialDeliveryAddress = '',
  catalogNote,
  submitting = false,
  onSubmit,
}) {
  const isCatalogLinked = Boolean(catalogNote);
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState('form');

  useEffect(() => {
    if (!open) return;
    setProductName(initialName);
    setQuantity(1);
    setUnitPrice('');
    setUserNotes('');
    setDeliveryAddress(String(initialDeliveryAddress || '').trim());
    setError('');
    setStep('form');
  }, [open, initialName, initialDeliveryAddress]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const notes = String(userNotes || '').trim();
    const delivery = String(deliveryAddress || '').trim();

    if (isCatalogLinked) {
      try {
        await onSubmit?.({
          isCatalog: true,
          quantity: qty,
          userNotes: notes,
          deliveryAddress: delivery,
        });
        setStep('success');
      } catch (err) {
        setError(err?.message?.trim() || 'Could not send your request. Please try again.');
      }
      return;
    }

    const name = String(productName || '').trim();
    if (name.length < 2) {
      setError('Product name must be at least 2 characters.');
      return;
    }
    const priceRaw = String(unitPrice || '').trim();
    const unit = Math.round(Number(priceRaw));
    if (!Number.isFinite(unit) || unit <= 0) {
      setError('Enter a valid unit price (FCFA) — whole number, greater than zero.');
      return;
    }

    setError('');
    try {
      await onSubmit?.({
        isCatalog: false,
        productName: name,
        quantity: qty,
        unitPrice: unit,
        userNotes: notes,
        deliveryAddress: delivery,
      });
      setStep('success');
    } catch (err) {
      setError(err?.message?.trim() || 'Could not send your request. Please try again.');
    }
  };

  const body = (
    <div className="preorder-modal-overlay wache-dialog-light" role="presentation" onClick={submitting ? undefined : onClose}>
      <div
        className="preorder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preorder-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="preorder-modal__close" onClick={onClose} disabled={submitting} aria-label="Close">
          ×
        </button>

        {step === 'success' ? (
          <div className="preorder-modal__success">
            <div className="preorder-modal__success-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2 id="preorder-modal-title" className="preorder-modal__title">
              Request received
            </h2>
            <p className="preorder-modal__lead">
              We will review your preorder. You may get a notification when stock is available or if we need more
              details.
            </p>
            <button type="button" className="preorder-modal__primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 id="preorder-modal-title" className="preorder-modal__title">
              {isCatalogLinked ? 'Request a preorder' : 'Preorder — product not listed'}
            </h2>
            <p className="preorder-modal__lead">
              {isCatalogLinked
                ? 'Confirm quantity and add optional notes or a delivery address for this catalog item.'
                : 'Describe the product you need, your target unit price, and quantity. The server stores this as a custom preorder.'}
            </p>
            {catalogNote ? <p className="preorder-modal__note">{catalogNote}</p> : null}

            {isCatalogLinked && initialName ? (
              <p className="preorder-modal__catalog-name" aria-live="polite">
                <span className="preorder-modal__catalog-name-label">Product</span>
                {initialName}
              </p>
            ) : null}

            <form onSubmit={handleSubmit} className="preorder-modal__form">
              {!isCatalogLinked ? (
                <>
                  <label className="preorder-modal__label">
                    Product name <span className="preorder-modal__req">*</span>
                    <input
                      type="text"
                      className="preorder-modal__input"
                      value={productName}
                      onChange={(e) => {
                        setProductName(e.target.value);
                        setError('');
                      }}
                      autoComplete="off"
                      maxLength={200}
                      disabled={submitting}
                      placeholder="e.g. Custom Smartphone Model X"
                    />
                  </label>
                  <label className="preorder-modal__label">
                    Unit price (FCFA) <span className="preorder-modal__req">*</span>
                    <input
                      type="number"
                      className="preorder-modal__input preorder-modal__input--price"
                      min={1}
                      step={1}
                      value={unitPrice}
                      onChange={(e) => {
                        setUnitPrice(e.target.value);
                        setError('');
                      }}
                      disabled={submitting}
                      placeholder="Target price per unit"
                    />
                  </label>
                </>
              ) : null}

              <label className="preorder-modal__label">
                Quantity <span className="preorder-modal__req">*</span>
                <input
                  type="number"
                  className="preorder-modal__input preorder-modal__input--qty"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => {
                    const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                    setQuantity(n);
                    setError('');
                  }}
                  disabled={submitting}
                />
              </label>

              <label className="preorder-modal__label">
                Notes <span className="preorder-modal__hint">(optional)</span>
                <textarea
                  className="preorder-modal__textarea preorder-modal__textarea--short"
                  value={userNotes}
                  onChange={(e) => {
                    setUserNotes(e.target.value);
                    setError('');
                  }}
                  disabled={submitting}
                  rows={2}
                  maxLength={500}
                  placeholder={isCatalogLinked ? 'e.g. Need this urgently' : 'e.g. Looking for bulk pricing'}
                />
              </label>

              <label className="preorder-modal__label">
                Delivery address <span className="preorder-modal__hint">(optional)</span>
                <textarea
                  className="preorder-modal__textarea preorder-modal__textarea--short"
                  value={deliveryAddress}
                  onChange={(e) => {
                    setDeliveryAddress(e.target.value);
                    setError('');
                  }}
                  disabled={submitting}
                  rows={2}
                  maxLength={500}
                  placeholder="Leave blank to use your business address on file"
                />
              </label>

              {error ? (
                <p className="preorder-modal__error" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="preorder-modal__actions">
                <button type="button" className="preorder-modal__secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="preorder-modal__primary" disabled={submitting} aria-busy={submitting}>
                  {submitting ? 'Sending…' : 'Send request'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(body, document.body);
  }
  return body;
}
