import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import './CartPage.css';
import { formatProductName } from '../utils/formatProductName';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';

import MoneyXaf from '../components/MoneyXaf';

function itemImage(item) {
  return item?.product?.primaryImage?.url || item?.product?.images?.[0]?.url || '';
}

export default function CartPage({
  items = [],
  subtotal = 0,
  onCheckout,
  checkoutSubmitting = false,
  onUpdateQty,
  onRemoveItem,
  canCheckout = true,
}) {
  const shipping = 0;
  const discount = 0;
  const total = Math.max(0, Number(subtotal) + shipping - discount);

  const runCheckout = useCallback(async () => {
    if (checkoutSubmitting || !canCheckout || items.length === 0) return;
    try {
      await onCheckout?.();
    } catch {
      /* parent or API already surfaced the error */
    }
  }, [canCheckout, checkoutSubmitting, items.length, onCheckout]);

  return (
    <div className="cart-page-modern">
      <div className={`cart-sheet${checkoutSubmitting ? ' cart-sheet--checkout-busy' : ''}`}>
        <header className="cart-sheet__head">
          <div className="cart-sheet__head-row">
            <h1>Cart</h1>
            <Link
              to="/"
              className="cart-back-to-shop"
              tabIndex={checkoutSubmitting ? -1 : undefined}
              aria-disabled={checkoutSubmitting}
              onClick={(e) => checkoutSubmitting && e.preventDefault()}
            >
              Continue shopping
            </Link>
          </div>
        </header>

        <div className="cart-sheet__items">
          {items.length === 0 ? (
            <p className="cart-empty">Your cart is empty.</p>
          ) : (
            items.map((i) => {
              const name = formatProductName(i.product?.product_name ?? i.product?.name ?? 'Product');
              const image = itemImage(i);
              const isOffer = String(i.orderType || 'buy') === 'offer';
              const rawQty = Math.floor(Number(i.qty) || 0);
              const qty = isOffer ? Math.max(1, rawQty) : Math.max(MIN_BUY_QUANTITY, rawQty);
              const price = isOffer ? (Number(i.offerAmount) || 0) : (Number(i.product?.price) || 0);
              const lineTotal = qty * price;
              return (
                <article key={i.id} className="cart-item-card">
                  <div className="cart-item-card__media">
                    {image ? <img src={image} alt={name} loading="lazy" decoding="async" /> : <div className="cart-item-card__ph">No Image</div>}
                  </div>
                  <div className="cart-item-card__body">
                    <h2 className="cart-item-card__title">{name}</h2>
                    <p className="cart-item-card__meta">
                      Unit price: <strong><MoneyXaf value={price} /></strong>
                    </p>
                    <p className="cart-item-card__meta">
                      Type: <strong>{isOffer ? 'Offer request' : 'Buy order'}</strong>
                    </p>
                    <p className="cart-item-card__meta">
                      Line total: <strong><MoneyXaf value={lineTotal} /></strong>
                    </p>
                    <div className="cart-item-card__qty">
                      <span>Quantity</span>
                      <div className="cart-qty-stepper" role="group" aria-label={`Quantity for ${name}`}>
                        <button
                          type="button"
                          onClick={() => onUpdateQty?.(i.id, qty - 1)}
                          disabled={checkoutSubmitting || (isOffer ? qty <= 1 : qty <= MIN_BUY_QUANTITY)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <span>{qty}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateQty?.(i.id, qty + 1)}
                          disabled={
                            checkoutSubmitting ||
                            (!isOffer &&
                              Number(i.product?.stock) > 0 &&
                              qty >= Number(i.product?.stock))
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="cart-remove-btn"
                        disabled={checkoutSubmitting}
                        onClick={() => onRemoveItem?.(i.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <div className="cart-sheet__summary">
          <div className="cart-summary-row">
            <span>Discount and Deposit</span>
            <strong><MoneyXaf value={discount} /></strong>
          </div>
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <strong><MoneyXaf value={subtotal} /></strong>
          </div>
          <div className="cart-summary-row">
            <span>Shipping</span>
            <strong><MoneyXaf value={shipping} /></strong>
          </div>
          <div className="cart-summary-row cart-summary-row--total">
            <span>Total</span>
            <strong><MoneyXaf value={total} /></strong>
          </div>
        </div>

        <button
          type="button"
          className="cart-continue-btn"
          disabled={!canCheckout || items.length === 0 || checkoutSubmitting}
          onClick={() => void runCheckout()}
          aria-busy={checkoutSubmitting}
        >
          {checkoutSubmitting ? (
            <span className="cart-continue-btn__inner">
              <span className="cart-continue-btn__spinner" aria-hidden />
              Submitting…
            </span>
          ) : (
            'Continue'
          )}
        </button>

        {!canCheckout && (
          <p className="cart-msg-lite">Your account is pending. Admin must activate it before checkout.</p>
        )}
      </div>
    </div>
  );
}
