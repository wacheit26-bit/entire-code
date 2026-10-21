import { useEffect, useMemo, useState } from 'react';
import { AlertDialog } from './AppDialog';
import MoneyXaf from './MoneyXaf';
import './SidebarFeaturedSpotlight.css';
import { formatProductName } from '../utils/formatProductName';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import { primaryProductImageUrl } from '../utils/productCatalogImage';

const ROTATE_MS = 4000;
const PICK_COUNT = 5;

function pickRandomProducts(list, n) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

function productImage(p) {
  return primaryProductImageUrl(p);
}

export default function SidebarFeaturedSpotlight({
  products = [],
  loading = false,
  onAddToCart,
  canAddToCart = true,
}) {
  const [index, setIndex] = useState(0);
  const [inactiveDialogOpen, setInactiveDialogOpen] = useState(false);
  const picks = useMemo(() => pickRandomProducts(products, PICK_COUNT), [products]);

  useEffect(() => {
    setIndex(0);
  }, [picks]);

  useEffect(() => {
    if (picks.length <= 1) return;
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % picks.length);
    }, ROTATE_MS);
    return () => window.clearInterval(t);
  }, [picks.length]);

  if (loading || picks.length === 0) return null;

  const p = picks[index];
  const id = String(p._id ?? p.id ?? '');
  const img = productImage(p);
  const name = formatProductName(p.product_name ?? p.name ?? 'Product');
  const stock = Number(p.stock) || 0;
  const belowMinBuy = stock > 0 && stock < MIN_BUY_QUANTITY;

  const handleAdd = () => {
    if (!id) return;
    if (belowMinBuy) return;
    if (!canAddToCart) {
      setInactiveDialogOpen(true);
      return;
    }
    onAddToCart?.(id, MIN_BUY_QUANTITY);
  };

  return (
    <div className="sidebar-featured" aria-live="polite">
      <AlertDialog
        open={inactiveDialogOpen}
        title="Account not active"
        message="Your vendor account must be active before placing orders."
        confirmLabel="OK"
        onClose={() => setInactiveDialogOpen(false)}
      />
      <p className="sidebar-featured__label">Featured picks</p>
      <div className="sidebar-featured__card">
        <div className="sidebar-featured__media">
          {img ? (
            <img src={img} alt="" className="sidebar-featured__img" />
          ) : null}
        </div>
        <p className="sidebar-featured__title">{name}</p>
        <p className="sidebar-featured__price">
          <MoneyXaf value={p.price} />
        </p>
        <button
          type="button"
          className="sidebar-featured__add"
          onClick={handleAdd}
          disabled={belowMinBuy}
          title={belowMinBuy ? `Need at least ${MIN_BUY_QUANTITY} in stock for a buy order` : undefined}
        >
          Add to cart
        </button>
        {picks.length > 1 ? (
          <div className="sidebar-featured__dots" aria-hidden>
            {picks.map((_, i) => (
              <span key={i} className={`sidebar-featured__dot ${i === index ? 'is-active' : ''}`} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
