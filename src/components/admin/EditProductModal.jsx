import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAdminAccountRegion from '../../hooks/useAdminAccountRegion';
import { updateProduct } from '../../api/productsApi';
import { fetchPricingCatalog } from '../../api/pricingApi';
import {
  applyCatalogPricesToUploadForm,
  buildPricingCatalogLookup,
  catalogPricesForUploadForm,
} from '../../utils/inventoryPricingDisplay';
import { parseBatteryHealthInput } from '../../utils/batteryHealth';
import './EditProductModal.css';

const PRODUCT_TYPES = ['Smartphone', 'tablet', 'laptop', 'accessory', 'other'];
const SIM_TYPES = ['Physical SIM', 'eSIM'];
const COUNTRIES = ['USA', 'CANADA', 'CHINA'];
const CAPACITY_OPTIONS = ['64GB', '128GB', '256GB', '512GB', '1TB', '2TB'];
const PHONE_LOCATION_OPTIONS = [
  { value: 'Douala', label: 'Douala' },
  { value: 'Yaounde', label: 'Yaoundé' },
  { value: 'Bafoussam', label: 'Bafoussam' },
  { value: 'Bamenda', label: 'Bamenda' },
  { value: 'Limbe', label: 'Limbe' },
  { value: 'Other', label: 'Other' },
];
const MAX_NEW_IMAGES = 5;

function normalizePhoneLocation(raw) {
  const s = String(raw || '').trim();
  const ascii = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (ascii === 'yaounde') return 'Yaounde';
  const allowed = PHONE_LOCATION_OPTIONS.map((o) => o.value);
  if (allowed.includes(s)) return s;
  const byLabel = PHONE_LOCATION_OPTIONS.find((o) => o.label.toLowerCase() === s.toLowerCase());
  if (byLabel) return byLabel.value;
  return 'Other';
}

function productToForm(p, pricingLookup = null) {
  if (!p) return null;
  const codes = Array.isArray(p?.imeCodes)
    ? p.imeCodes.map((c) => String(c).trim()).filter(Boolean)
    : p?.IME
      ? [String(p.IME).trim()]
      : [];
  const catalog = catalogPricesForUploadForm(p, pricingLookup);
  const wholesaleFromProduct =
    p.price != null && p.price !== '' && Number(p.price) > 0 ? String(p.price) : '';
  const wholesaleFromCatalog =
    catalog?.wholesalePrice != null && Number(catalog.wholesalePrice) > 0
      ? String(catalog.wholesalePrice)
      : '';
  const retailFromCatalog =
    catalog?.retailPrice != null && Number(catalog.retailPrice) > 0 ? String(catalog.retailPrice) : '';

  return {
    product_type: String(p.product_type || 'Smartphone'),
    product_name: String(p.product_name ?? ''),
    brand: String(p.brand ?? ''),
    phoneLocation: normalizePhoneLocation(p.phoneLocation),
    capacity: String(p.capacity ?? ''),
    country: COUNTRIES.includes(String(p.country)) ? String(p.country) : '',
    sim: SIM_TYPES.includes(String(p.sim)) ? String(p.sim) : '',
    color: String(p.color ?? ''),
    batteryHealth:
      p.batteryHealth != null && p.batteryHealth !== '' && Number.isFinite(Number(p.batteryHealth))
        ? String(Math.round(Number(p.batteryHealth)))
        : '',
    stock: Number(p.stock) >= 0 ? Number(p.stock) : 0,
    wholesalePrice: wholesaleFromProduct || wholesaleFromCatalog,
    retailPrice: retailFromCatalog,
    costPrice: p.costPrice != null && p.costPrice !== '' ? String(p.costPrice) : '',
    imeCodesText: codes.join('\n'),
    description: String(p.description ?? ''),
  };
}

/** Images already on the server (for cover selection). */
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
      out.push({
        publicId,
        url,
        isPrimary: Boolean(img.isPrimary),
      });
    }
  }
  if (
    out.length === 0 &&
    product.primaryImage?.url &&
    String(product.primaryImage?.publicId || '').trim()
  ) {
    const publicId = String(product.primaryImage.publicId).trim();
    out.push({
      publicId,
      url: product.primaryImage.url,
      isPrimary: true,
    });
  }
  return out;
}

export default function EditProductModal({ product, onClose, onSaved }) {
  const axiosPrivate = useAxiosPrivate();
  const { isUsaAccount } = useAdminAccountRegion();
  const titleId = useId();
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);

  const [form, setForm] = useState(() => productToForm(product) || {});
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [newImages, setNewImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const stableId = String(product?._id ?? product?.id ?? '');

  const pricingLookup = useMemo(
    () => buildPricingCatalogLookup(pricingCatalog),
    [pricingCatalog],
  );

  const catalogMatched = useMemo(
    () => Boolean(catalogPricesForUploadForm(form, pricingLookup)),
    [form, pricingLookup],
  );

  useEffect(() => {
    let cancelled = false;
    fetchPricingCatalog(axiosPrivate)
      .then((rows) => {
        if (!cancelled) setPricingCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPricingCatalog([]);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  useEffect(() => {
    if (!product) return;
    setForm(productToForm(product, pricingLookup) || {});
    setNewImages([]);
    setError('');
    setDragOver(false);
  }, [product, stableId, pricingLookup]);

  useEffect(() => {
    if (!pricingLookup.size) return undefined;
    setForm((prev) => applyCatalogPricesToUploadForm(prev, pricingLookup, { force: true }));
  }, [form.brand, form.product_name, form.capacity, pricingLookup]);

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

  const update = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const canSubmit = useMemo(() => {
    const imeCodes = String(form.imeCodesText || '')
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const stock = Number(form.stock) || 0;
    const imeOk = stock <= 0 || imeCodes.length === stock;
    return (
      form.product_type &&
      form.product_name?.trim() &&
      form.brand?.trim() &&
      form.phoneLocation &&
      form.capacity?.trim() &&
      form.country?.trim() &&
      form.sim?.trim() &&
      form.color?.trim() &&
      form.description?.trim() &&
      Number(form.stock) >= 0 &&
      Number(form.wholesalePrice) >= 0 &&
      imeOk
    );
  }, [form]);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!incoming.length) return;
    setNewImages((prev) => [...prev, ...incoming].slice(0, MAX_NEW_IMAGES));
  };

  const removeNewAt = (idx) => {
    setNewImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stableId || !canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const batteryParsed = parseBatteryHealthInput(form.batteryHealth);
      if (batteryParsed.error) {
        setError(batteryParsed.error);
        setLoading(false);
        return;
      }

      const imeCodes = String(form.imeCodesText || '')
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await updateProduct(axiosPrivate, stableId, {
        ...form,
        batteryHealth: batteryParsed.value,
        imeCodes,
      }, newImages);
      await Promise.resolve(onSaved?.(updated));
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update product.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && !loading) onClose?.();
  };

  const previewUrls = useMemo(() => catalogImagesList(product).map((img) => img.url), [product]);

  if (!product || typeof document === 'undefined') return null;

  return createPortal(
    <div className="edit-product-modal" role="presentation" onMouseDown={handleBackdrop}>
      <div
        ref={panelRef}
        className="edit-product-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="edit-product-modal__head">
          <div>
            <p className="edit-product-modal__eyebrow">Edit product</p>
            <h2 id={titleId} className="edit-product-modal__title">
              {form.product_name?.trim() || 'Untitled product'}
            </h2>
          </div>
          <button
            type="button"
            className="edit-product-modal__close"
            onClick={() => !loading && onClose?.()}
            aria-label="Close"
          >
            ×
          </button>
        </header>

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
              <p className="edit-product-modal__hint">Existing photos stay on the server. Add more below if needed.</p>
            </section>
          ) : null}

          <section className="edit-product-modal__section">
            <h3>Details</h3>
            <label className="edit-product-field edit-product-field--full">
              <span>Product name</span>
              <input
                value={form.product_name}
                onChange={(e) => update('product_name', e.target.value)}
                placeholder="e.g. iPhone 15 Pro Max"
                autoComplete="off"
              />
            </label>

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Brand</span>
                <input value={form.brand} onChange={(e) => update('brand', e.target.value)} placeholder="e.g. Apple" maxLength={100} />
              </label>
              <label className="edit-product-field">
                <span>Phone location</span>
                <select value={form.phoneLocation} onChange={(e) => update('phoneLocation', e.target.value)}>
                  {PHONE_LOCATION_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Type</span>
                <select value={form.product_type} onChange={(e) => update('product_type', e.target.value)}>
                  {PRODUCT_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="edit-product-field">
                <span>Capacity</span>
                <select value={form.capacity} onChange={(e) => update('capacity', e.target.value)}>
                  <option value="">Select…</option>
                  {CAPACITY_OPTIONS.map((cap) => (
                    <option key={cap} value={cap}>
                      {cap}
                    </option>
                  ))}
                  {form.capacity && !CAPACITY_OPTIONS.includes(form.capacity) ? (
                    <option value={form.capacity}>{form.capacity}</option>
                  ) : null}
                </select>
              </label>
            </div>

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Color</span>
                <input value={form.color} onChange={(e) => update('color', e.target.value)} placeholder="e.g. Black" />
              </label>
              <label className="edit-product-field">
                <span>Country of origin</span>
                <select value={form.country} onChange={(e) => update('country', e.target.value)}>
                  <option value="">Select…</option>
                  {COUNTRIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>SIM type</span>
                <select value={form.sim} onChange={(e) => update('sim', e.target.value)}>
                  <option value="">Select…</option>
                  {SIM_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="edit-product-field">
                <span>Battery health (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={form.batteryHealth}
                  onChange={(e) => update('batteryHealth', e.target.value)}
                  placeholder="Optional (0–100)"
                />
              </label>
            </div>

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Stock quantity</span>
                <input type="number" min={0} value={form.stock} onChange={(e) => update('stock', e.target.value)} />
              </label>
            </div>

            {isUsaAccount ? (
              <div className="edit-product-row">
                <label className="edit-product-field">
                  <span>Cost price</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.costPrice}
                    onChange={(e) => update('costPrice', e.target.value)}
                    placeholder="Unit cost"
                  />
                </label>
              </div>
            ) : null}

            <div className="edit-product-row">
              <label className="edit-product-field">
                <span>Retail price (XAF)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.retailPrice}
                  onChange={(e) => update('retailPrice', e.target.value)}
                  placeholder="From pricing catalog"
                />
              </label>
              <label className="edit-product-field">
                <span>Vendor price (XAF)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => update('wholesalePrice', e.target.value)}
                  placeholder="Required for vendor listing"
                />
              </label>
            </div>

            <p className="edit-product-modal__hint">
              Retail and vendor prices auto-fill from <strong>Direct sale → Pricing</strong> when
              product name, brand, and capacity match (case-insensitive).
              {catalogMatched ? ' Catalog match found for this variant.' : ' No catalog entry for this variant yet.'}
            </p>

            <label className="edit-product-field edit-product-field--full">
              <span>
                IME codes — one per line ({String(form.imeCodesText || '').split(/[\n,;]+/).filter((s) => s.trim()).length}/
                {Math.max(0, Number(form.stock) || 0)})
              </span>
              <textarea
                rows={4}
                value={form.imeCodesText}
                onChange={(e) => update('imeCodesText', e.target.value)}
                placeholder={'IME001\nIME002'}
              />
            </label>

            <p className="edit-product-modal__hint">
              Products appear on the vendor Shop when vendor price is greater than zero.
            </p>

            <label className="edit-product-field edit-product-field--full">
              <span>Description</span>
              <textarea rows={4} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Brief product description…" />
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
              Drop new images here or click to browse (PNG, JPG, WEBP)
            </button>
            {newImages.length > 0 ? (
              <ul className="edit-product-modal__new-files">
                {newImages.map((f, idx) => (
                  <li key={`${f.name}-${idx}`}>
                    <span>{f.name}</span>
                    <button type="button" onClick={() => removeNewAt(idx)}>
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
            <button type="submit" className="edit-product-modal__btn edit-product-modal__btn--primary" disabled={loading || !canSubmit}>
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
