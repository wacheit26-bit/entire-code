import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { updateProduct } from '../../api/productsApi';
import './EditProductModal.css';
import './WarehouseProductPricingModal.css';

const MAX_NEW_IMAGES = 5;

function productToForm(p) {
  if (!p) return null;
  return {
    price: p.price != null && p.price !== '' ? String(p.price) : '',
    priceMin: p.priceMin != null && p.priceMin !== '' ? String(p.priceMin) : '',
    priceMax: p.priceMax != null && p.priceMax !== '' ? String(p.priceMax) : '',
  };
}

function catalogImagesList(product) {
  if (!product) return [];
  const out = [];
  const seen = new Set();
  if (Array.isArray(product.images)) {
    for (const img of product.images) {
      const publicId = String(img?.publicId || '').trim();
      const url = img?.url;
      if (!publicId || !url || seen.has(publicId)) continue;
      seen.add(publicId);
      out.push({ publicId, url, isPrimary: Boolean(img.isPrimary) });
    }
  }
  if (
    out.length === 0 &&
    product.primaryImage?.url &&
    String(product.primaryImage?.publicId || '').trim()
  ) {
    out.push({
      publicId: String(product.primaryImage.publicId).trim(),
      url: product.primaryImage.url,
      isPrimary: true,
    });
  }
  return out;
}

export default function WarehouseProductPricingModal({ product, onClose, onSaved }) {
  const axiosPrivate = useAxiosPrivate();
  const titleId = useId();
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);

  const [form, setForm] = useState(() => productToForm(product) || {});
  const [newImages, setNewImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stableId = String(product?._id ?? product?.id ?? '');

  useEffect(() => {
    if (!product) return;
    setForm(productToForm(product) || {});
    setNewImages([]);
    setError('');
    setDragOver(false);
  }, [product, stableId]);

  useEffect(() => {
    if (!product) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [product]);

  useEffect(() => {
    if (!product) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !loading) onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, loading, onClose]);

  const previewUrls = useMemo(() => catalogImagesList(product).map((img) => img.url), [product]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stableId) return;
    setError('');
    setLoading(true);
    try {
      const base = {
        product_type: product.product_type,
        product_name: product.product_name,
        brand: product.brand,
        phoneLocation: product.phoneLocation,
        capacity: product.capacity,
        country: product.country,
        sim: product.sim,
        color: product.color,
        stock: product.stock,
        description: product.description,
        price: form.price !== '' ? Math.max(0, Number(form.price) || 0) : 0,
      };
      if (form.priceMin !== '') base.priceMin = Math.max(0, Number(form.priceMin) || 0);
      if (form.priceMax !== '') base.priceMax = Math.max(0, Number(form.priceMax) || 0);

      const updated = await updateProduct(axiosPrivate, stableId, base, newImages);
      await Promise.resolve(onSaved?.(updated));
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update product.');
    } finally {
      setLoading(false);
    }
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!incoming.length) return;
    setNewImages((prev) => [...prev, ...incoming].slice(0, MAX_NEW_IMAGES));
  };

  if (!product || typeof document === 'undefined') return null;

  return createPortal(
    <div className="edit-product-modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !loading && onClose?.()}>
      <div
        ref={panelRef}
        className="edit-product-modal__panel wh-pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="edit-product-modal__head">
          <div>
            <p className="edit-product-modal__eyebrow">Warehouse pricing</p>
            <h2 id={titleId} className="edit-product-modal__title">
              {product.product_name || 'Product'}
            </h2>
          </div>
          <button type="button" className="edit-product-modal__close" onClick={() => !loading && onClose?.()} aria-label="Close">
            ×
          </button>
        </header>

        <p className="wh-pricing-modal__lead">
          Set selling price and optional price range. Add at least one product photo — stock is hidden on the Shop until photos are uploaded.
        </p>

        {error ? <p className="edit-product-modal__err">{error}</p> : null}

        <form onSubmit={handleSubmit} className="edit-product-modal__form">
          {previewUrls.length > 0 ? (
            <section className="edit-product-modal__section edit-product-modal__section--images">
              <h3>Current images</h3>
              <div className="edit-product-modal__thumb-row">
                {previewUrls.map((url) => (
                  <div key={url} className="edit-product-modal__thumb">
                    <img src={url} alt="" loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="edit-product-modal__section">
            <h3>Pricing</h3>
            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Selling price (XAF)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="Required for vendor listing"
                />
              </label>
              <label className="edit-product-field">
                <span>Price range min (optional)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceMin}
                  onChange={(e) => setForm((f) => ({ ...f, priceMin: e.target.value }))}
                />
              </label>
            </div>
            <label className="edit-product-field">
              <span>Price range max (optional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceMax}
                onChange={(e) => setForm((f) => ({ ...f, priceMax: e.target.value }))}
              />
            </label>
          </section>

          <section className="edit-product-modal__section">
            <h3>
              Add images <span className="edit-product-modal__muted">({newImages.length}/{MAX_NEW_IMAGES} new)</span>
            </h3>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="edit-product-modal__file-input"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              className={`edit-product-modal__dropzone ${dragOver ? 'is-dragover' : ''}`}
              onDragOver={(ev) => {
                ev.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(ev) => {
                ev.preventDefault();
                setDragOver(false);
                addFiles(ev.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              Drop new images here or click to browse
            </button>
            {newImages.length > 0 ? (
              <ul className="edit-product-modal__new-files">
                {newImages.map((f, idx) => (
                  <li key={`${f.name}-${idx}`}>
                    <span>{f.name}</span>
                    <button type="button" onClick={() => setNewImages((prev) => prev.filter((_, i) => i !== idx))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <footer className="edit-product-modal__footer">
            <button type="button" className="edit-product-modal__btn edit-product-modal__btn--ghost" disabled={loading} onClick={() => onClose?.()}>
              Cancel
            </button>
            <button type="submit" className="edit-product-modal__btn edit-product-modal__btn--primary" disabled={loading}>
              {loading ? 'Saving…' : 'Save pricing & photos'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
