import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchWarehouses, pickDefaultMainId, subsForMainWarehouse, warehouseId } from '../../api/warehouseApi';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import {
  ADMIN_BRAND_OPTIONS,
  ADMIN_PHONES_BY_BRAND,
  resolveBrandForPhoneName,
} from '../../data/adminAddProductCatalog';
import './AddProductForm.css';

const PRODUCT_TYPES = ['Smartphone', 'tablet', 'laptop', 'accessory', 'other'];
const SIM_TYPES = ['Physical SIM', 'eSIM'];
const COUNTRIES = ['USA', 'CANADA', 'CHINA'];
const CAPACITY_OPTIONS = ['128GB', '256GB', '512GB', '1TB'];
/** `value` must match ItemsList `phoneLocation` enum (ASCII). `label` is display-only. */
const PHONE_LOCATION_OPTIONS = [
  { value: 'Douala', label: 'Douala' },
  { value: 'Yaounde', label: 'Yaoundé' },
  { value: 'Bafoussam', label: 'Bafoussam' },
  { value: 'Bamenda', label: 'Bamenda' },
  { value: 'Limbe', label: 'Limbe' },
  { value: 'Other', label: 'Other' },
];
const MAX_IMAGES = 5;

const INITIAL = {
  brand: '',
  product_name: '',
  product_type: 'Smartphone',
  phoneLocation: 'Other',
  destinationSubWarehouse: '',
  capacity: '',
  country: '',
  sim: '',
  color: '',
  stock: 0,
  price: '',
  description: '',
};

export default function AddProductForm({ onProductCreated }) {
  const axiosPrivate = useAxiosPrivate();
  const inputRef = useRef(null);
  const [form, setForm] = useState(INITIAL);
  const [images, setImages] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [warehousesError, setWarehousesError] = useState('');
  const [mainWarehouses, setMainWarehouses] = useState([]);
  const [allSubWarehouses, setAllSubWarehouses] = useState([]);
  const [selectedMainId, setSelectedMainId] = useState('');

  const selectedMain = useMemo(
    () => mainWarehouses.find((m) => warehouseId(m) === selectedMainId) || null,
    [mainWarehouses, selectedMainId],
  );

  const subWarehouses = useMemo(
    () => subsForMainWarehouse(allSubWarehouses, selectedMainId),
    [allSubWarehouses, selectedMainId],
  );

  const loadWarehouses = useCallback(async () => {
    setWarehousesLoading(true);
    setWarehousesError('');
    try {
      const data = await fetchWarehouses(axiosPrivate);
      const mains = Array.isArray(data.mainWarehouses) ? data.mainWarehouses : [];
      const subs = Array.isArray(data.subWarehouses) ? data.subWarehouses : [];
      setMainWarehouses(mains);
      setAllSubWarehouses(subs);
      setSelectedMainId((prev) => {
        const nextMainId = pickDefaultMainId(mains, prev);
        const filteredSubs = subsForMainWarehouse(subs, nextMainId);
        if (filteredSubs.length === 1) {
          const onlyId = warehouseId(filteredSubs[0]);
          setForm((formPrev) =>
            formPrev.destinationSubWarehouse
              ? formPrev
              : { ...formPrev, destinationSubWarehouse: onlyId },
          );
        }
        return nextMainId;
      });
    } catch (err) {
      setMainWarehouses([]);
      setAllSubWarehouses([]);
      setSelectedMainId('');
      setWarehousesError(
        err?.response?.data?.message || err?.message || 'Could not load warehouses.',
      );
    } finally {
      setWarehousesLoading(false);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  useEffect(() => {
    if (!form.destinationSubWarehouse) return;
    const ok = subWarehouses.some((w) => warehouseId(w) === form.destinationSubWarehouse);
    if (!ok) setForm((prev) => ({ ...prev, destinationSubWarehouse: '' }));
  }, [selectedMainId, subWarehouses, form.destinationSubWarehouse]);

  const phoneOptions = useMemo(() => {
    const b = String(form.brand || '').trim();
    if (b) return ADMIN_PHONES_BY_BRAND[b] || [];
    return [
      ...ADMIN_PHONES_BY_BRAND.SAMSUNG,
      ...ADMIN_PHONES_BY_BRAND.APPLE,
      ...ADMIN_PHONES_BY_BRAND.PIXEL,
    ];
  }, [form.brand]);

  const canSubmit = useMemo(() => {
    return (
      form.product_type &&
      form.product_name.trim() &&
      form.brand.trim() &&
      form.phoneLocation &&
      form.capacity.trim() &&
      form.country.trim() &&
      form.sim.trim() &&
      form.color.trim() &&
      form.description.trim() &&
      form.destinationSubWarehouse &&
      Number(form.stock) >= 0 &&
      Number(form.price) >= 0
    );
  }, [form]);

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleBrandChange = (value) => {
    setForm((prev) => {
      if (!value) {
        return { ...prev, brand: '', product_name: '' };
      }
      const list = ADMIN_PHONES_BY_BRAND[value] || [];
      const current = String(prev.product_name || '').trim();
      const keep = current && list.includes(current) ? prev.product_name : '';
      return { ...prev, brand: value, product_name: keep };
    });
  };

  const handleProductNameChange = (value) => {
    setForm((prev) => {
      const name = String(value || '').trim();
      let nextBrand = String(prev.brand || '').trim();
      if (!nextBrand && name) {
        const inferred = resolveBrandForPhoneName(name);
        if (inferred) nextBrand = inferred;
      }
      return { ...prev, product_name: value, brand: nextBrand };
    });
  };

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!incoming.length) return;
    setImages((prev) => [...prev, ...incoming].slice(0, MAX_IMAGES));
  };

  const removeImageAt = (idx) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!canSubmit) {
      if (!mainWarehouses.length) {
        setError('Create a regional main warehouse first (Warehouses tab).');
      } else if (!selectedMainId) {
        setError('Select the regional main warehouse.');
      } else if (!form.destinationSubWarehouse) {
        setError('Select the destination Shop for this stock.');
      } else {
        setError('Please fill all required fields correctly.');
      }
      return;
    }

    setLoading(true);
    try {
      const normalizedBrand = form.brand.trim().toUpperCase();
      const normalizedCapacity = form.capacity.trim().toUpperCase();
      const fd = new FormData();
      fd.append('product_type', form.product_type);
      fd.append('product_name', form.product_name.trim());
      fd.append('brand', normalizedBrand);
      fd.append('phoneLocation', form.phoneLocation);
      fd.append('destinationSubWarehouse', form.destinationSubWarehouse);
      fd.append('capacity', normalizedCapacity);
      fd.append('country', form.country.trim());
      fd.append('sim', form.sim.trim());
      fd.append('color', form.color.trim());
      fd.append('stock', String(Number(form.stock)));
      fd.append('price', String(Number(form.price)));
      fd.append('description', form.description.trim());
      images.forEach((img) => fd.append('images', img));

      const res = await axiosPrivate.post('/products', fd, {
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const createdProduct = res?.data?.data ?? res?.data ?? null;
      notifyProductCatalogUpdated();
      await onProductCreated?.(createdProduct);
      setSuccess('Product created successfully.');
      setForm(INITIAL);
      setImages([]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create product.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL);
    setImages([]);
    setError('');
    setSuccess('');
  };

  return (
    <section className="dash-panel add-product-panel">
      <h3>Add Product</h3>
      <p className="add-product-sub">Upload a new product to the Shop</p>

      {error && <p className="add-product-msg add-product-msg--err">{error}</p>}
      {success && <p className="add-product-msg add-product-msg--ok">{success}</p>}

      <form onSubmit={handleSubmit} className="add-product-grid">
        <section className="add-card">
          <h4>Product Details</h4>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Brand</span>
              <select value={form.brand} onChange={(e) => handleBrandChange(e.target.value)} required>
                <option value="">Select brand…</option>
                {ADMIN_BRAND_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Product name</span>
              <select
                value={form.product_name}
                onChange={(e) => handleProductNameChange(e.target.value)}
                required
              >
                <option value="">Select model…</option>
                {phoneOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Regional main warehouse</span>
              <select
                value={selectedMainId}
                onChange={(e) => setSelectedMainId(e.target.value)}
                required
                disabled={warehousesLoading}
              >
                <option value="">
                  {warehousesLoading
                    ? 'Loading…'
                    : mainWarehouses.length === 0
                      ? warehousesError
                        ? 'Could not load warehouses'
                        : 'Add a main warehouse first'
                      : 'Select region…'}
                </option>
                {mainWarehouses.map((m) => {
                  const id = warehouseId(m);
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {m.name} ({m.city || 'Other'})
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span>Destination Shop</span>
              <select
                value={form.destinationSubWarehouse}
                onChange={(e) => update('destinationSubWarehouse', e.target.value)}
                required
                disabled={warehousesLoading || !selectedMainId || subWarehouses.length === 0}
              >
                <option value="">
                  {warehousesLoading
                    ? 'Loading warehouses…'
                    : !selectedMainId
                      ? 'Select main warehouse first'
                      : subWarehouses.length === 0
                        ? 'Add a Shop for this region'
                        : 'Select destination…'}
                </option>
                {subWarehouses.map((w) => {
                  const id = warehouseId(w);
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {w.name} ({w.city || 'Other'})
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          {warehousesError ? (
            <p className="add-product-msg add-product-msg--err">
              {warehousesError}{' '}
              <button type="button" className="btn-reset" onClick={() => loadWarehouses()}>
                Retry
              </button>
            </p>
          ) : null}
          <p className="add-product-warehouse-hint">
            Stock is uploaded at {selectedMain?.name || 'the regional main warehouse'} and is on hand
            immediately. Use <strong>Send to Shop</strong> from the warehouse hub when ready to ship.
          </p>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Phone location</span>
              <select value={form.phoneLocation} onChange={(e) => update('phoneLocation', e.target.value)} required>
                {PHONE_LOCATION_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--spacer" aria-hidden="true" />
          </div>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Type</span>
              <select value={form.product_type} onChange={(e) => update('product_type', e.target.value)}>
                {PRODUCT_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field field--spacer" aria-hidden="true" />
          </div>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Capacity</span>
              <select value={form.capacity} onChange={(e) => update('capacity', e.target.value)} required>
                <option value="">Select capacity…</option>
                {CAPACITY_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Color</span>
              <input value={form.color} onChange={(e) => update('color', e.target.value)} placeholder="Select.." required />
            </label>
          </div>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Country of Origin</span>
              <select value={form.country} onChange={(e) => update('country', e.target.value)} required>
                <option value="">Select..</option>
                {COUNTRIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>SIM Type</span>
              <select value={form.sim} onChange={(e) => update('sim', e.target.value)} required>
                <option value="">Select..</option>
                {SIM_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="add-product-row add-product-row--2">
            <label className="field">
              <span>Price (XAF)</span>
              <input type="number" min={0} step="0.01" value={form.price} onChange={(e) => update('price', e.target.value)} placeholder="e.g. 250000" required />
            </label>
            <label className="field">
              <span>Stock Quantity</span>
              <input type="number" min={0} value={form.stock} onChange={(e) => update('stock', e.target.value)} placeholder="e.g. 20" required />
            </label>
          </div>

          <label className="field field--full">
            <span>Description</span>
            <textarea rows={4} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="Brief product description..." required />
          </label>
        </section>

        <section className="add-card">
          <h4>
            Product images (optional — add before Shop listing) <span>({images.length}/{MAX_IMAGES})</span>
          </h4>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(e) => addFiles(e.target.files)}
            className="hidden-file-input"
          />
          <button
            type="button"
            className={`upload-dropzone ${dragOver ? 'dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
          >
            <div className="upload-dropzone-inner">
              <div className="upload-icon">🖼</div>
              <p>
                Drag & drop images here or click to <strong>browse</strong>
              </p>
              <small>PNG, JPG, WEBP up to {MAX_IMAGES} images total</small>
            </div>
          </button>

          {!!images.length && (
            <ul className="image-preview-list">
              {images.map((f, idx) => (
                <li key={`${f.name}-${idx}`}>
                  <span>{f.name}</span>
                  <button type="button" onClick={() => removeImageAt(idx)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="add-actions">
          <button type="button" className="btn-reset" onClick={handleReset}>
            Reset
          </button>
          <button type="submit" className="btn-upload" disabled={loading || !canSubmit}>
            {loading ? 'Uploading…' : 'Upload Product'}
          </button>
        </div>
      </form>
    </section>
  );
}
