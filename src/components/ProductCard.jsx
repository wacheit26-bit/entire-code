import { useState } from 'react';
import './ProductCard.css';

const PLACEHOLDER_IMG = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect fill="#e2e8f0" width="120" height="120"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-size="12" font-family="sans-serif">No image</text></svg>'
);

const COUNTRY_FLAGS = {
  USA: '🇺🇸',
  CANADA: '🇨🇦',
  CHINA: '🇨🇳',
};

export default function ProductCard({ product, onAddToCart, onAddToWatchlist }) {
  const [qty, setQty] = useState(1);

  const handleAddToCart = () => {
    onAddToCart?.(product.id, qty);
  };

  const stock = product.stock ?? 0;
  const modelCode = product.modelCode || product.model || '';

  return (
    <article className="product-card">
      <div className="product-card-top">
        <div className="product-card-heading">
          <h3 className="product-card-name">{product.name}</h3>
          {modelCode && <p className="product-card-model">Model: {modelCode}</p>}
        </div>
        <div className="product-card-stock-row">
          <span className="product-card-stock">{stock} Stock</span>
          <button type="button" className="product-card-info" aria-label="Stock info">ⓘ</button>
          <button type="button" className="product-card-fav" aria-label="Add to watchlist" onClick={() => onAddToWatchlist?.(product.id)}>★</button>
        </div>
      </div>
      <div className="product-card-image">
        <img src={product.image || PLACEHOLDER_IMG} alt={product.name} />
      </div>
      {product.sku && <p className="product-card-sku">{product.sku}</p>}
      <div className="product-card-specs">
        <div className="spec-row">
          <span className="spec-label">Capacity:</span>
          <span className="spec-value">{product.capacity}</span>
        </div>
        <div className="spec-row">
          <span className="spec-label">Carrier:</span>
          <span className="spec-value spec-link">{product.carrier}</span>
        </div>
        {product.country && (
          <div className="spec-row">
            <span className="spec-label">Country:</span>
            <span className="spec-value spec-country">
              <span className="spec-flag" aria-hidden="true">{COUNTRY_FLAGS[product.country] ?? '🏳️'}</span>
              {product.country}
            </span>
          </div>
        )}
        <div className="spec-row">
          <span className="spec-label">Color:</span>
          <span className="spec-value spec-link">{product.color}</span>
        </div>
        {product.sim && (
          <div className="spec-row">
            <span className="spec-label">Sim:</span>
            <span className="spec-value">{product.sim === 'esim' ? 'eSIM' : 'SIM'}</span>
          </div>
        )}
        <div className="spec-row">
          <span className="spec-label">IMEI:</span>
          <span className="spec-value">{product.imei || '—'}</span>
        </div>
      </div>
      <div className="product-card-bottom">
        <span className="product-card-price">${Number(product.price).toFixed(2)}</span>
        <div className="product-card-actions-wrap">
          <div className="product-card-qty-desktop">
            <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Decrease quantity">−</button>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              aria-label="Quantity"
            />
            <button type="button" onClick={() => setQty((n) => n + 1)} aria-label="Increase quantity">+</button>
          </div>
          <div className="product-card-actions-desktop">
            <button type="button" className="btn-buy" onClick={handleAddToCart}>BUY</button>
            <button type="button" className="btn-offer">OFFER</button>
          </div>
        </div>
      </div>
      <a href={`#product-${product.id}`} className="product-card-view-details">View Details</a>
    </article>
  );
}
