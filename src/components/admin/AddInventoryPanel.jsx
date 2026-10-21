import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAdminAccountRegion from '../../hooks/useAdminAccountRegion';
import { fetchAdminInventoryProducts } from '../../api/adminApi';
import { fetchWarehouses, fetchWarehouseProducts, pickDefaultMainId, subsForMainWarehouse, warehouseId } from '../../api/warehouseApi';
import {
  notifyProductCatalogUpdated,
  subscribePricingCatalogOptionsUpdated,
} from '../../utils/productCatalogEvents';
import { fetchPricingCatalog, fetchPricingCatalogOptions } from '../../api/pricingApi';
import {
  buildPricingBrandOptions,
  buildPricingProductNameOptions,
  EMPTY_PRICING_CATALOG_OPTIONS,
  normalizePricingBrand,
} from '../../utils/pricingCatalogOptions';
import {
  applyCatalogPricesToUploadForm,
  buildPricingCatalogLookup,
} from '../../utils/inventoryPricingDisplay';
import FormattedNumber from '../FormattedNumber';
import { parseBatteryHealthInput } from '../../utils/batteryHealth';
import {
  filterMergedInventory,
  formatInventoryCapacities,
  inventoryRowKey,
  mergeInventoryProducts,
} from '../../utils/mergeInventoryProducts';
import InventoryFilters from '../sales/InventoryFilters';
import BulkAddProductForm from './BulkAddProductForm';
import EditProductModal from './EditProductModal';
import WarehouseProductPricingModal from './WarehouseProductPricingModal';
import { resolveBrandForPhoneName } from '../../data/adminAddProductCatalog';
import './WarehouseDashboard.css';
import './AddInventoryPanel.css';
import './AdminOrdersPanel.css';

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
const MAX_IMAGES = 5;

const UPLOAD_INITIAL = {
  brand: '',
  product_name: '',
  product_type: 'Smartphone',
  phoneLocation: 'Other',
  destinationSubWarehouse: '',
  capacity: '',
  country: 'USA',
  sim: '',
  color: '',
  batteryHealth: '',
  stock: 1,
  costPrice: '',
  wholesalePrice: '',
  retailPrice: '',
  imeCodesText: '',
  description: '',
};

function parseImeLines(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isMainWarehouse(wh) {
  if (!wh) return false;
  if (wh.isMain === true) return true;
  return String(wh.type || '').toLowerCase() === 'main';
}

function isUsaWarehouse(wh) {
  return String(wh?.city || '').trim() === 'USA';
}

function productRowId(p) {
  return String(p?._id ?? p?.id ?? '');
}

export default function AddInventoryPanel({ warehouse = null, onProductSaved }) {
  const axiosPrivate = useAxiosPrivate();
  const { label: accountLabel, isUsaAccount, isCameroonAccount } = useAdminAccountRegion();
  const inputRef = useRef(null);

  const whId = warehouse ? warehouseId(warehouse) : '';
  const inWarehouseContext = Boolean(whId);
  const isUsaWarehouseMode = inWarehouseContext ? isUsaWarehouse(warehouse) : isUsaAccount;
  const isRegionalEditMode = inWarehouseContext && !isUsaWarehouse(warehouse);

  const [uploadTab, setUploadTab] = useState('single');

  const [form, setForm] = useState(UPLOAD_INITIAL);
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

  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCapacityFilter, setCatalogCapacityFilter] = useState('');
  const [editProduct, setEditProduct] = useState(null);
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [catalogOptions, setCatalogOptions] = useState(EMPTY_PRICING_CATALOG_OPTIONS);

  const pricingLookup = useMemo(
    () => buildPricingCatalogLookup(pricingCatalog),
    [pricingCatalog],
  );

  const reloadPricingSources = useCallback(async () => {
    try {
      const [rows, options] = await Promise.all([
        fetchPricingCatalog(axiosPrivate),
        fetchPricingCatalogOptions(axiosPrivate),
      ]);
      setPricingCatalog(Array.isArray(rows) ? rows : []);
      setCatalogOptions(options || EMPTY_PRICING_CATALOG_OPTIONS);
    } catch {
      setPricingCatalog([]);
      setCatalogOptions(EMPTY_PRICING_CATALOG_OPTIONS);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    reloadPricingSources().catch(() => {});
  }, [reloadPricingSources]);

  useEffect(() => {
    return subscribePricingCatalogOptionsUpdated(() => {
      reloadPricingSources().catch(() => {});
    });
  }, [reloadPricingSources]);

  const brandOptions = useMemo(
    () =>
      buildPricingBrandOptions({
        customOptions: catalogOptions,
        pricingRows: pricingCatalog,
        currentBrand: form.brand,
      }),
    [catalogOptions, pricingCatalog, form.brand],
  );

  const phoneOptions = useMemo(
    () =>
      buildPricingProductNameOptions({
        brand: form.brand,
        customOptions: catalogOptions,
        pricingRows: pricingCatalog,
        currentProductName: form.product_name,
      }),
    [form.brand, form.product_name, catalogOptions, pricingCatalog],
  );

  useEffect(() => {
    if (!pricingCatalog.length && !pricingLookup.size) return undefined;
    setForm((prev) =>
      applyCatalogPricesToUploadForm(prev, pricingLookup, { catalogRows: pricingCatalog }),
    );
  }, [form.brand, form.product_name, form.capacity, pricingLookup, pricingCatalog]);

  const subWarehouses = useMemo(
    () => subsForMainWarehouse(allSubWarehouses, selectedMainId),
    [allSubWarehouses, selectedMainId],
  );

  const imeCodes = useMemo(() => parseImeLines(form.imeCodesText), [form.imeCodesText]);
  const stockQty = Math.max(0, Math.floor(Number(form.stock) || 0));

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
        if (isMainWarehouse(warehouse) && isUsaWarehouse(warehouse)) {
          return warehouseId(warehouse);
        }
        const whMainId = isMainWarehouse(warehouse) ? warehouseId(warehouse) : '';
        const whShopParent =
          !isMainWarehouse(warehouse) && warehouse?.parentWarehouse
            ? warehouseId(warehouse.parentWarehouse)
            : '';
        const preferred = whMainId || whShopParent || prev;
        return pickDefaultMainId(mains, preferred);
      });
      if (!isMainWarehouse(warehouse)) {
        const shopId = warehouseId(warehouse);
        if (shopId) {
          setForm((prev) => ({ ...prev, destinationSubWarehouse: shopId }));
        }
      }
    } catch (err) {
      setMainWarehouses([]);
      setAllSubWarehouses([]);
      setWarehousesError(err?.response?.data?.message || err?.message || 'Could not load warehouses.');
    } finally {
      setWarehousesLoading(false);
    }
  }, [axiosPrivate, warehouse]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      if (isRegionalEditMode && whId) {
        const data = await fetchWarehouseProducts(axiosPrivate, whId);
        setCatalog(Array.isArray(data.products) ? data.products : []);
      } else {
        const rows = await fetchAdminInventoryProducts(axiosPrivate);
        setCatalog(Array.isArray(rows) ? rows : []);
      }
    } catch (err) {
      setCatalog([]);
      setCatalogError(err?.response?.data?.message || err?.message || 'Could not load products.');
    } finally {
      setCatalogLoading(false);
    }
  }, [axiosPrivate, isRegionalEditMode, whId]);

  useEffect(() => {
    if (isUsaWarehouseMode) loadWarehouses();
  }, [isUsaWarehouseMode, loadWarehouses]);

  useEffect(() => {
    if (isRegionalEditMode || (isCameroonAccount && !inWarehouseContext)) loadCatalog();
  }, [isRegionalEditMode, isCameroonAccount, inWarehouseContext, loadCatalog]);

  useEffect(() => {
    if (!form.destinationSubWarehouse) return;
    const ok = subWarehouses.some((w) => warehouseId(w) === form.destinationSubWarehouse);
    if (!ok && subWarehouses.length === 1) {
      setForm((prev) => ({ ...prev, destinationSubWarehouse: warehouseId(subWarehouses[0]) }));
    } else if (!ok) {
      setForm((prev) => ({ ...prev, destinationSubWarehouse: '' }));
    }
  }, [selectedMainId, subWarehouses, form.destinationSubWarehouse]);

  const mergedCatalog = useMemo(() => mergeInventoryProducts(catalog), [catalog]);

  const filteredCatalog = useMemo(
    () =>
      filterMergedInventory(mergedCatalog, {
        nameQuery: catalogSearch,
        capacity: catalogCapacityFilter,
      }),
    [mergedCatalog, catalogSearch, catalogCapacityFilter],
  );

  const unlistedCount = useMemo(
    () => catalog.filter((p) => !(Number(p?.price) > 0)).length,
    [catalog],
  );

  const usaMainId = useMemo(() => {
    if (isMainWarehouse(warehouse) && isUsaWarehouse(warehouse)) return whId;
    if (warehouse?.parentWarehouse) {
      const parentId = warehouseId(warehouse.parentWarehouse);
      if (parentId) return parentId;
    }
    const usaMain = mainWarehouses.find((m) => m.city === 'USA');
    return usaMain ? warehouseId(usaMain) : selectedMainId;
  }, [warehouse, whId, mainWarehouses, selectedMainId]);

  const canUploadRegional = useMemo(() => {
    if (!isRegionalEditMode || !whId) return false;
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
      stockQty >= 1 &&
      Number(form.wholesalePrice) > 0 &&
      imeCodes.length === stockQty
    );
  }, [form, imeCodes.length, isRegionalEditMode, stockQty, whId]);

  const canUpload = useMemo(() => {
    if (!isUsaWarehouseMode || !isUsaAccount) return false;
    const usaDirectUpload = inWarehouseContext && isUsaWarehouse(warehouse);
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
      (usaDirectUpload ? Boolean(usaMainId) : Boolean(form.destinationSubWarehouse)) &&
      stockQty >= 1 &&
      form.costPrice !== '' &&
      Number(form.costPrice) >= 0 &&
      imeCodes.length === stockQty
    );
  }, [
    form,
    imeCodes.length,
    inWarehouseContext,
    isUsaAccount,
    isUsaWarehouseMode,
    stockQty,
    usaMainId,
    warehouse,
  ]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleBrandChange = (value) => {
    setForm((prev) => {
      if (!value) return { ...prev, brand: '', product_name: '' };
      const list = buildPricingProductNameOptions({
        brand: value,
        customOptions: catalogOptions,
        pricingRows: pricingCatalog,
        currentProductName: prev.product_name,
      });
      const current = String(prev.product_name || '').trim();
      const keep = current && list.includes(current) ? prev.product_name : '';
      return { ...prev, brand: normalizePricingBrand(value), product_name: keep };
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

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!canUpload) {
      if (imeCodes.length !== stockQty) {
        setError(`Enter exactly ${stockQty} IME code(s) — one per unit (${imeCodes.length} provided).`);
      } else {
        setError('Complete all required fields, warehouse routing, and cost price.');
      }
      return;
    }

    setLoading(true);
    try {
      const batteryParsed = parseBatteryHealthInput(form.batteryHealth);
      if (batteryParsed.error) {
        setError(batteryParsed.error);
        setLoading(false);
        return;
      }

      const fd = new FormData();
      fd.append('product_type', form.product_type);
      fd.append('product_name', form.product_name.trim());
      fd.append('brand', form.brand.trim().toUpperCase());
      fd.append('phoneLocation', form.phoneLocation);
      if (inWarehouseContext && isUsaWarehouse(warehouse) && usaMainId) {
        fd.append('mainWarehouse', usaMainId);
      } else {
        fd.append('destinationSubWarehouse', form.destinationSubWarehouse);
      }
      fd.append('capacity', form.capacity.trim().toUpperCase());
      fd.append('country', form.country.trim());
      fd.append('sim', form.sim.trim());
      fd.append('color', form.color.trim());
      if (batteryParsed.value != null) {
        fd.append('batteryHealth', String(batteryParsed.value));
      }
      fd.append('stock', String(stockQty));
      fd.append('costPrice', String(Number(form.costPrice)));
      if (form.wholesalePrice !== '') {
        fd.append('price', String(Number(form.wholesalePrice)));
      }
      if (form.retailPrice !== '') {
        fd.append('retailPrice', String(Number(form.retailPrice)));
      }
      fd.append('imeCodes', JSON.stringify(imeCodes));
      fd.append('description', form.description.trim());
      images.forEach((img) => fd.append('images', img));

      const res = await axiosPrivate.post('/products', fd, {
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const createdProduct = res?.data?.data ?? res?.data ?? null;
      notifyProductCatalogUpdated();
      await onProductSaved?.(createdProduct);
        setSuccess(
        Number(form.wholesalePrice) > 0
          ? 'Product uploaded and ready for vendor listing.'
          : 'Product uploaded. Set a vendor price before it appears on the vendor Shop.',
      );
      setForm(UPLOAD_INITIAL);
      setImages([]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload product.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegionalUpload = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!canUploadRegional) {
      if (imeCodes.length !== stockQty) {
        setError(`Enter exactly ${stockQty} IME code(s) — one per unit (${imeCodes.length} provided).`);
      } else if (!(Number(form.wholesalePrice) > 0)) {
        setError('Vendor price is required so the product is listed on the Shop.');
      } else {
        setError('Complete all required fields, IME codes, and vendor price.');
      }
      return;
    }

    setLoading(true);
    try {
      const batteryParsed = parseBatteryHealthInput(form.batteryHealth);
      if (batteryParsed.error) {
        setError(batteryParsed.error);
        setLoading(false);
        return;
      }

      const fd = new FormData();
      fd.append('product_type', form.product_type);
      fd.append('product_name', form.product_name.trim());
      fd.append('brand', form.brand.trim().toUpperCase());
      fd.append('phoneLocation', form.phoneLocation);
      fd.append('uploadWarehouse', whId);
      fd.append('capacity', form.capacity.trim().toUpperCase());
      fd.append('country', form.country.trim());
      fd.append('sim', form.sim.trim());
      fd.append('color', form.color.trim());
      if (batteryParsed.value != null) {
        fd.append('batteryHealth', String(batteryParsed.value));
      }
      fd.append('stock', String(stockQty));
      fd.append('price', String(Number(form.wholesalePrice)));
      if (form.retailPrice !== '') {
        fd.append('retailPrice', String(Number(form.retailPrice)));
      }
      fd.append('imeCodes', JSON.stringify(imeCodes));
      fd.append('description', form.description.trim());
      images.forEach((img) => fd.append('images', img));

      const res = await axiosPrivate.post('/products', fd, {
        timeout: 120000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      const createdProduct = res?.data?.data ?? res?.data ?? null;
      notifyProductCatalogUpdated();
      await onProductSaved?.(createdProduct);
      await loadCatalog();
      setSuccess('Product uploaded and listed on the Shop.');
      setForm({ ...UPLOAD_INITIAL, phoneLocation: form.phoneLocation });
      setImages([]);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to upload product.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wh-dash-wrap add-inventory-wrap">
      <section className="wh-hero add-inventory-hero">
        <div className="wh-hero__inner">
          <p className="add-inventory-hero__eyebrow">Add inventory</p>
          <h2>
            {isUsaWarehouseMode
              ? 'Upload new stock (USA Warehouse)'
              : isRegionalEditMode
                ? `Edit stock at ${warehouse?.name || 'this warehouse'}`
                : 'Edit inventory & pricing'}
          </h2>
          <p>
            {inWarehouseContext ? (
              isUsaWarehouseMode ? (
                <>
                  <strong>{warehouse?.name}</strong> · USA Warehouse. Bulk upload or single upload with
                  cost price and one IME per unit.
                </>
              ) : (
                <>
                  Products at <strong>{warehouse?.name}</strong>. Bulk or single upload with IME and
                  vendor price — listed on the Shop when priced and photographed.
                </>
              )
            ) : (
              <>
                Signed in as <strong>{accountLabel}</strong>.
                {isUsaAccount
                  ? ' Upload products with cost price and one IME per unit.'
                  : ' Update pricing on existing catalog items.'}
              </>
            )}
          </p>
        </div>
      </section>

      <div className="wh-status-row add-inventory-kpis">
        <article className="wh-status-card">
          <span className="wh-status-card__icon wh-status-card__icon--request" aria-hidden>
            {isUsaAccount ? '🇺🇸' : '🇨🇲'}
          </span>
          <div className="wh-status-card__body">
            <span className="wh-status-card__label">Account</span>
            <span className="wh-status-card__value">
              {inWarehouseContext ? warehouse?.city || 'Warehouse' : accountLabel}
            </span>
            <span className="wh-status-card__sub">
              {isUsaWarehouseMode ? 'Upload + bulk + IME' : 'Single upload + pricing'}
            </span>
          </div>
        </article>
        <article className="wh-status-card">
          <span className="wh-status-card__icon wh-status-card__icon--stock" aria-hidden>
            📦
          </span>
          <div className="wh-status-card__body">
            <span className="wh-status-card__label">
              {isUsaWarehouseMode ? 'IMEs required' : 'Products here'}
            </span>
            <span className="wh-status-card__value">
              {isUsaWarehouseMode ? '1 per unit' : catalog.length}
            </span>
            <span className="wh-status-card__sub">
              {isUsaWarehouseMode
                ? 'Match stock quantity exactly'
                : isRegionalEditMode
                  ? 'Single + bulk upload'
                  : `${unlistedCount} awaiting vendor price`}
            </span>
          </div>
        </article>
        <article className="wh-status-card">
          <span className="wh-status-card__icon wh-status-card__icon--travel" aria-hidden>
            💰
          </span>
          <div className="wh-status-card__body">
            <span className="wh-status-card__label">Vendor listing</span>
            <span className="wh-status-card__value">Selling price</span>
            <span className="wh-status-card__sub">Required before Shop display</span>
          </div>
        </article>
      </div>

      {isUsaWarehouseMode ? (
        <>
          <div className="add-inventory-upload-tabs" role="tablist" aria-label="Upload mode">
            <button
              type="button"
              role="tab"
              aria-selected={uploadTab === 'single'}
              className={`admin-orders-tab ${uploadTab === 'single' ? 'is-active' : ''}`}
              onClick={() => setUploadTab('single')}
            >
              Single upload
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={uploadTab === 'bulk'}
              className={`admin-orders-tab ${uploadTab === 'bulk' ? 'is-active' : ''}`}
              onClick={() => setUploadTab('bulk')}
            >
              Bulk upload
            </button>
          </div>

          {uploadTab === 'bulk' ? (
            <BulkAddProductForm
              embedded
              usaMode
              catalogOptions={catalogOptions}
              pricingCatalog={pricingCatalog}
              fixedMainWarehouseId={
                isMainWarehouse(warehouse) && isUsaWarehouse(warehouse) ? whId : usaMainId
              }
              onProductsCreated={async () => {
                notifyProductCatalogUpdated();
                await onProductSaved?.();
              }}
            />
          ) : (
        <section className="wh-panel add-inventory-panel">
          <div className="wh-section-head">
            <h3>Upload product</h3>
            {warehouse?.name ? <span className="wh-location-row__count">{warehouse.name}</span> : null}
          </div>

          {!isUsaAccount ? (
            <p className="add-inventory-alert add-inventory-alert--error">
              USA WACHE account required to upload inventory.
            </p>
          ) : null}

          {warehousesError ? <p className="add-inventory-alert add-inventory-alert--error">{warehousesError}</p> : null}
          {error ? <p className="add-inventory-alert add-inventory-alert--error">{error}</p> : null}
          {success ? <p className="add-inventory-alert add-inventory-alert--ok">{success}</p> : null}

          <form className="add-inventory-form" onSubmit={handleUpload}>
            <div className="add-inventory-row">
              <label className="add-inventory-field">
                <span>Brand</span>
                <select value={form.brand} onChange={(e) => handleBrandChange(e.target.value)} required>
                  <option value="">Select brand…</option>
                  {brandOptions.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="add-inventory-field">
                <span>Product name</span>
                <input
                  list="add-inventory-phone-names"
                  value={form.product_name}
                  onChange={(e) => handleProductNameChange(e.target.value)}
                  placeholder="e.g. Galaxy S21"
                  required
                />
                <datalist id="add-inventory-phone-names">
                  {phoneOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="add-inventory-row">
              {inWarehouseContext && isUsaWarehouse(warehouse) ? (
                <p className="add-inventory-hint">
                  Stock is uploaded to <strong>{warehouse?.name || 'this USA Warehouse'}</strong>. After
                  marking uploads received, use <strong>Send to warehouse</strong> to ship to a regional main
                  warehouse.
                </p>
              ) : (
                <>
                  <label className="add-inventory-field">
                    <span>Regional main Warehouse</span>
                    <select
                      value={selectedMainId}
                      onChange={(e) => setSelectedMainId(e.target.value)}
                      disabled={warehousesLoading}
                      required
                    >
                      <option value="">Select…</option>
                      {mainWarehouses
                        .filter((m) => !inWarehouseContext || m.city === 'USA')
                        .map((m) => (
                          <option key={warehouseId(m)} value={warehouseId(m)}>
                            {m.name} — {m.city || 'Other'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="add-inventory-field">
                    <span>Destination Shop</span>
                    <select
                      value={form.destinationSubWarehouse}
                      onChange={(e) => update('destinationSubWarehouse', e.target.value)}
                      disabled={!selectedMainId || subWarehouses.length === 0}
                      required
                    >
                      <option value="">Select Shop…</option>
                      {subWarehouses.map((s) => (
                        <option key={warehouseId(s)} value={warehouseId(s)}>
                          {s.name} — {s.city || 'Other'}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="add-inventory-row add-inventory-row--4">
              <label className="add-inventory-field">
                <span>Stock quantity</span>
                <input
                  type="number"
                  min={1}
                  value={form.stock}
                  onChange={(e) => update('stock', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                  required
                />
              </label>
              <label className="add-inventory-field">
                <span>Cost price (required)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => update('costPrice', e.target.value)}
                  placeholder="Unit cost"
                  required
                />
              </label>
              <label className="add-inventory-field">
                <span>Vendor price (optional)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.wholesalePrice}
                  onChange={(e) => update('wholesalePrice', e.target.value)}
                  placeholder="Shop listing price"
                />
              </label>
              <label className="add-inventory-field">
                <span>Capacity</span>
                <select value={form.capacity} onChange={(e) => update('capacity', e.target.value)} required>
                  <option value="">Select…</option>
                  {CAPACITY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="add-inventory-row">
              <label className="add-inventory-field">
                <span>Retail price (optional)</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.retailPrice}
                  onChange={(e) => update('retailPrice', e.target.value)}
                  placeholder="Direct sale retail price"
                />
              </label>
            </div>

            <label className="add-inventory-field">
              <span>
                IME codes ({imeCodes.length}/{stockQty}) — one per line
              </span>
              <textarea
                rows={6}
                value={form.imeCodesText}
                onChange={(e) => update('imeCodesText', e.target.value)}
                placeholder={'IME001\nIME002\nIME003'}
                required
              />
            </label>

            <div className="add-inventory-row">
              <label className="add-inventory-field">
                <span>Country</span>
                <select value={form.country} onChange={(e) => update('country', e.target.value)} required>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="add-inventory-field">
                <span>SIM</span>
                <select value={form.sim} onChange={(e) => update('sim', e.target.value)} required>
                  <option value="">Select…</option>
                  {SIM_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="add-inventory-field">
                <span>Color</span>
                <input value={form.color} onChange={(e) => update('color', e.target.value)} required />
              </label>
              <label className="add-inventory-field">
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

            <label className="add-inventory-field">
              <span>Description</span>
              <textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} required />
            </label>

            <div className="add-inventory-images">
              <span className="add-inventory-field__label">Product images (optional — add before Shop listing)</span>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                type="button"
                className={`add-inventory-dropzone ${dragOver ? 'is-dragover' : ''}`}
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
                onClick={() => inputRef.current?.click()}
              >
                Drop images or click to browse ({images.length}/{MAX_IMAGES})
              </button>
              {images.length > 0 ? (
                <ul className="add-inventory-file-list">
                  {images.map((f, idx) => (
                    <li key={`${f.name}-${idx}`}>
                      {f.name}
                      <button type="button" onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="add-inventory-actions">
              <button type="submit" className="add-inventory-btn add-inventory-btn--primary" disabled={loading || !canUpload}>
                {loading ? 'Uploading…' : 'Upload product'}
              </button>
            </div>
          </form>
        </section>
          )}
        </>
      ) : (
        <>
        {isRegionalEditMode ? (
          <>
            <div className="add-inventory-upload-tabs" role="tablist" aria-label="Upload mode">
              <button
                type="button"
                role="tab"
                aria-selected={uploadTab === 'single'}
                className={`admin-orders-tab ${uploadTab === 'single' ? 'is-active' : ''}`}
                onClick={() => setUploadTab('single')}
              >
                Single upload
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={uploadTab === 'bulk'}
                className={`admin-orders-tab ${uploadTab === 'bulk' ? 'is-active' : ''}`}
                onClick={() => setUploadTab('bulk')}
              >
                Bulk upload
              </button>
            </div>

            {uploadTab === 'bulk' ? (
              <BulkAddProductForm
                embedded
                regionalMode
                catalogOptions={catalogOptions}
                pricingCatalog={pricingCatalog}
                fixedUploadWarehouseId={whId}
                warehouseName={warehouse?.name}
                onProductsCreated={async () => {
                  notifyProductCatalogUpdated();
                  await onProductSaved?.();
                  await loadCatalog();
                }}
              />
            ) : (
          <section className="wh-panel add-inventory-panel">
            <div className="wh-section-head">
              <h3>Upload product</h3>
              {warehouse?.name ? <span className="wh-location-row__count">{warehouse.name}</span> : null}
            </div>
            <p className="add-inventory-hint">
              Single upload with IME and selling price. Stock is marked arrived at this warehouse and
              appears on the vendor Shop only when it has photos and a selling price.
            </p>
            {error ? <p className="add-inventory-alert add-inventory-alert--error">{error}</p> : null}
            {success ? <p className="add-inventory-alert add-inventory-alert--ok">{success}</p> : null}
            <form className="add-inventory-form" onSubmit={handleRegionalUpload}>
              <div className="add-inventory-row">
                <label className="add-inventory-field">
                  <span>Brand</span>
                  <select value={form.brand} onChange={(e) => handleBrandChange(e.target.value)} required>
                    <option value="">Select brand…</option>
                    {brandOptions.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="add-inventory-field">
                  <span>Product name</span>
                  <input
                    list="add-inventory-phone-names-regional"
                    value={form.product_name}
                    onChange={(e) => handleProductNameChange(e.target.value)}
                    placeholder="e.g. Galaxy S21"
                    required
                  />
                  <datalist id="add-inventory-phone-names-regional">
                    {phoneOptions.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
              </div>
              <div className="add-inventory-row add-inventory-row--4">
                <label className="add-inventory-field">
                  <span>Stock quantity</span>
                  <input
                    type="number"
                    min={1}
                    value={form.stock}
                    onChange={(e) => update('stock', Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    required
                  />
                </label>
                <label className="add-inventory-field">
                  <span>Vendor price (required)</span>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={form.wholesalePrice}
                    onChange={(e) => update('wholesalePrice', e.target.value)}
                    required
                  />
                </label>
                <label className="add-inventory-field">
                  <span>Retail price (optional)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.retailPrice}
                    onChange={(e) => update('retailPrice', e.target.value)}
                    placeholder="Direct sale retail price"
                  />
                </label>
                <label className="add-inventory-field">
                  <span>Capacity</span>
                  <select value={form.capacity} onChange={(e) => update('capacity', e.target.value)} required>
                    <option value="">Select…</option>
                    {CAPACITY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="add-inventory-field">
                <span>
                  IME codes ({imeCodes.length}/{stockQty}) — one per line
                </span>
                <textarea
                  rows={5}
                  value={form.imeCodesText}
                  onChange={(e) => update('imeCodesText', e.target.value)}
                  required
                />
              </label>
              <div className="add-inventory-row">
                <label className="add-inventory-field">
                  <span>Capacity</span>
                  <select value={form.capacity} onChange={(e) => update('capacity', e.target.value)} required>
                    <option value="">Select…</option>
                    {CAPACITY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="add-inventory-field">
                  <span>Color</span>
                  <input value={form.color} onChange={(e) => update('color', e.target.value)} required />
                </label>
                <label className="add-inventory-field">
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
                <label className="add-inventory-field">
                  <span>Phone location</span>
                  <select value={form.phoneLocation} onChange={(e) => update('phoneLocation', e.target.value)} required>
                    {PHONE_LOCATION_OPTIONS.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="add-inventory-row">
                <label className="add-inventory-field">
                  <span>Country</span>
                  <select value={form.country} onChange={(e) => update('country', e.target.value)} required>
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="add-inventory-field">
                  <span>SIM</span>
                  <select value={form.sim} onChange={(e) => update('sim', e.target.value)} required>
                    <option value="">Select…</option>
                    {SIM_TYPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="add-inventory-field">
                <span>Description</span>
                <textarea rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} required />
              </label>
              <div className="add-inventory-images">
                <span className="add-inventory-field__label">Product images (optional — add before Shop listing)</span>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  className="add-inventory-file-input"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <button
                  type="button"
                  className={`add-inventory-dropzone ${dragOver ? 'is-dragover' : ''}`}
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
                  onClick={() => inputRef.current?.click()}
                >
                  Drop images or click to browse ({images.length}/{MAX_IMAGES})
                </button>
              </div>
              <div className="add-inventory-actions">
                <button
                  type="submit"
                  className="add-inventory-btn add-inventory-btn--primary"
                  disabled={loading || !canUploadRegional}
                >
                  {loading ? 'Uploading…' : 'Upload & list product'}
                </button>
              </div>
            </form>
          </section>
            )}
          </>
        ) : null}

        <section className="wh-panel add-inventory-panel">
          <div className="wh-section-head">
            <h3>{isRegionalEditMode ? 'Products at this warehouse' : 'Edit inventory'}</h3>
            <span className="wh-location-row__count">{filteredCatalog.length} products</span>
          </div>

          {isRegionalEditMode ? (
            <p className="add-inventory-hint">
              Stock already at <strong>{warehouse?.name}</strong>. Edit selling price, price range, IME,
              and photos below. Products need photos before they appear on the Shop.
            </p>
          ) : null}

          {catalogError ? <p className="add-inventory-alert add-inventory-alert--error">{catalogError}</p> : null}

          {mergedCatalog.length > 0 ? (
            <InventoryFilters
              rows={mergedCatalog}
              nameQuery={catalogSearch}
              capacity={catalogCapacityFilter}
              onNameQueryChange={setCatalogSearch}
              onCapacityChange={setCatalogCapacityFilter}
              idPrefix="add-inv"
            />
          ) : null}

          {catalogLoading ? <p className="wh-empty">Loading catalog…</p> : null}

          {!catalogLoading && filteredCatalog.length === 0 ? (
            <p className="wh-empty">
              {isRegionalEditMode
                ? 'No products have been sent to this warehouse yet.'
                : 'No products match the selected filters.'}
            </p>
          ) : null}

          {!catalogLoading && filteredCatalog.length > 0 ? (
            <div className="add-inventory-table-wrap">
              <table className="wh-activity-table add-inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Stock</th>
                    <th className="fit-numeric-cell">Cost</th>
                    <th className="fit-numeric-cell">Selling price</th>
                    <th>Listing</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalog.slice(0, 100).map((row) => {
                    const locations = Array.isArray(row?.locations) ? row.locations : [];
                    const p = locations[0]?.product || row;
                    const id = productRowId(p);
                    const listed = Number(p?.price) > 0;
                    return (
                      <tr key={inventoryRowKey(row) || id}>
                        <td>
                          <strong>{row.product_name}</strong>
                          <br />
                          <span className="wh-status-card__sub">
                            {row.brand} · {formatInventoryCapacities(row)}
                          </span>
                        </td>
                        <td>{Math.max(0, Number(row.stock) || 0)}</td>
                        <td className="fit-numeric-cell">
                          {p.costPrice != null ? <FormattedNumber value={p.costPrice} /> : '—'}
                        </td>
                        <td className="fit-numeric-cell">
                          {listed ? <FormattedNumber value={p.price} /> : '—'}
                        </td>
                        <td>
                          <span className={`add-inventory-pill ${listed ? 'add-inventory-pill--listed' : 'add-inventory-pill--draft'}`}>
                            {listed ? 'Listed' : 'Draft'}
                          </span>
                        </td>
                        <td>
                          <button type="button" className="add-inventory-btn add-inventory-btn--ghost" onClick={() => setEditProduct(p)}>
                            Edit
                          </button>
                          {locations.length > 1 ? (
                            <span className="wh-status-card__sub" style={{ display: 'block', marginTop: '0.25rem' }}>
                              {locations.length} areas
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
        </>
      )}

      {editProduct ? (
        isRegionalEditMode ? (
          <EditProductModal
            product={editProduct}
            onClose={() => setEditProduct(null)}
            onSaved={async () => {
              await onProductSaved?.();
              await loadCatalog();
              setEditProduct(null);
            }}
          />
        ) : (
          <WarehouseProductPricingModal
            product={editProduct}
            onClose={() => setEditProduct(null)}
            onSaved={async (updated) => {
              await onProductSaved?.(updated);
              await loadCatalog();
              setEditProduct(null);
            }}
          />
        )
      ) : null}
    </div>
  );
}
