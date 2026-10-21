import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import {
  addPricingCatalogBrand,
  addPricingCatalogProductName,
  createPricingEntry,
  fetchPricingCatalog,
  fetchPricingCatalogOptions,
  fetchSalesPricingCatalog,
  MAX_PRICING_IMAGES,
  updatePricingEntry,
} from '../../api/pricingApi';
import {
  buildPricingBrandOptions,
  buildPricingProductNameOptions,
  EMPTY_PRICING_CATALOG_OPTIONS,
  formatPricingBrandLabel,
  normalizePricingBrand,
} from '../../utils/pricingCatalogOptions';
import { capacities as CAPACITY_OPTIONS } from '../../data/productSchema';
import { fetchAdminInventoryProducts } from '../../api/adminApi';
import { fetchProductsList, normalizeProductRecord } from '../../api/productsApi';
import MoneyXaf from '../MoneyXaf';
import { formatNumberWithCommas, parseFormattedNumber } from '../../utils/formatMoneyXaf';
import { resolvePricingRowDisplayImage } from '../../utils/productCatalogImage';
import { productPricingCatalogKey } from '../../utils/pricingCatalogMatch';
import { AppModal } from '../AppDialog';
import { notifyPricingCatalogOptionsUpdated } from '../../utils/productCatalogEvents';
import './DirectSalePricingTab.css';

const EMPTY_FORM = {
  productName: '',
  brand: '',
  capacity: '',
  retailPrice: '',
  wholesalePrice: '',
};

function rowId(row) {
  return String(row?.id ?? row?._id ?? '');
}

function normalizeBrandValue(brand) {
  return normalizePricingBrand(brand);
}

function PricingCatalogPick({
  label,
  emptyLabel,
  value,
  onChange,
  options,
  disabled,
  addLabel,
  addOpen,
  addDraft,
  onAddDraftChange,
  onAddOpen,
  onAddCancel,
  onAddConfirm,
  addPlaceholder,
  showAdd = true,
}) {
  return (
    <div className="admin-direct-sale-pricing__pick">
      <label className="admin-direct-sale-pricing__pick-label">
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={!disabled}
        >
          <option value="">{emptyLabel}</option>
          {options.map((opt) => (
            <option key={opt.value ?? opt} value={opt.value ?? opt}>
              {opt.label ?? opt}
            </option>
          ))}
        </select>
      </label>
      {showAdd ? (
        <button
          type="button"
          className="admin-direct-sale-pricing__pick-add"
          onClick={onAddOpen}
          disabled={disabled}
          aria-label={addLabel}
        >
          <span className="admin-direct-sale-pricing__pick-add-icon" aria-hidden>
            +
          </span>
          {addLabel}
        </button>
      ) : null}
      {addOpen ? (
        <div className="admin-direct-sale-pricing__pick-inline-add">
          <input
            type="text"
            value={addDraft}
            onChange={(e) => onAddDraftChange(e.target.value)}
            placeholder={addPlaceholder}
            maxLength={120}
            autoFocus
          />
          <button type="button" className="app-dialog__btn app-dialog__btn--primary" onClick={onAddConfirm}>
            Add
          </button>
          <button type="button" className="app-dialog__btn" onClick={onAddCancel}>
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}

function isAdminRole(auth) {
  const role = String(auth?.role ?? '').toLowerCase();
  if (role === 'admin') return true;
  const roles = Array.isArray(auth?.roles) ? auth.roles : [];
  return roles.some((r) => String(r).toLowerCase() === 'admin');
}

export default function DirectSalePricingTab({ isAdmin = false }) {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const canManagePricing = isAdmin || isAdminRole(auth);
  const imageInputRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErr, setFormErr] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [saveOk, setSaveOk] = useState('');
  const [existingImages, setExistingImages] = useState([]);
  const [removedImagePublicIds, setRemovedImagePublicIds] = useState(() => new Set());
  const [newImages, setNewImages] = useState([]);
  const [newImagePreviews, setNewImagePreviews] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [customCatalog, setCustomCatalog] = useState(EMPTY_PRICING_CATALOG_OPTIONS);
  const [catalogOptionsLoading, setCatalogOptionsLoading] = useState(false);
  const [brandAddOpen, setBrandAddOpen] = useState(false);
  const [brandAddDraft, setBrandAddDraft] = useState('');
  const [productAddOpen, setProductAddOpen] = useState(false);
  const [productAddDraft, setProductAddDraft] = useState('');

  useEffect(() => {
    return () => {
      newImagePreviews.forEach((url) => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
    };
  }, [newImagePreviews]);

  const keptExistingCount = useMemo(
    () =>
      existingImages.filter(
        (img) => !removedImagePublicIds.has(String(img.publicId || img.url || '')),
      ).length,
    [existingImages, removedImagePublicIds],
  );

  const totalImageCount = keptExistingCount + newImages.length;
  const canAddMoreImages = totalImageCount < MAX_PRICING_IMAGES;

  const resetImageState = useCallback((row = null) => {
    const normalized = Array.isArray(row?.images)
      ? row.images
          .filter((img) => String(img?.url || '').trim())
          .map((img) => ({
            url: String(img.url).trim(),
            publicId: String(img.publicId || img.url || '').trim(),
            alt: String(img.alt || '').trim(),
          }))
      : row?.imageUrl
        ? [
            {
              url: String(row.imageUrl).trim(),
              publicId: String(row.imagePublicId || row.imageUrl || '').trim(),
              alt: String(row.imageAlt || '').trim(),
            },
          ]
        : [];

    setExistingImages(normalized);
    setRemovedImagePublicIds(new Set());
    setNewImages([]);
    setNewImagePreviews((prev) => {
      prev.forEach((url) => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      return [];
    });
    setDragOver(false);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const addFiles = useCallback(
    (fileList) => {
      const incoming = Array.from(fileList || []).filter((f) => /^image\//.test(String(f?.type || '')));
      if (!incoming.length || !canAddMoreImages) return;

      const room = MAX_PRICING_IMAGES - totalImageCount;
      const nextFiles = incoming.slice(0, room);
      if (!nextFiles.length) return;

      const previews = nextFiles.map((file) => URL.createObjectURL(file));
      setNewImages((prev) => [...prev, ...nextFiles]);
      setNewImagePreviews((prev) => [...prev, ...previews]);
    },
    [canAddMoreImages, totalImageCount],
  );

  const loadInventoryForImages = useCallback(async () => {
    try {
      const data = canManagePricing
        ? await fetchAdminInventoryProducts(axiosPrivate)
        : await fetchProductsList();
      setInventoryProducts((Array.isArray(data) ? data : []).map(normalizeProductRecord));
    } catch {
      setInventoryProducts([]);
    }
  }, [axiosPrivate, canManagePricing]);

  const loadCatalogOptions = useCallback(async () => {
    setCatalogOptionsLoading(true);
    try {
      const data = await fetchPricingCatalogOptions(axiosPrivate);
      setCustomCatalog(data || EMPTY_PRICING_CATALOG_OPTIONS);
    } catch {
      setCustomCatalog(EMPTY_PRICING_CATALOG_OPTIONS);
    } finally {
      setCatalogOptionsLoading(false);
    }
  }, [axiosPrivate]);

  const loadPricing = useCallback(async () => {
    setLoadErr('');
    setLoading(true);
    try {
      const fetcher = canManagePricing ? fetchPricingCatalog : fetchSalesPricingCatalog;
      const [data] = await Promise.all([
        fetcher(axiosPrivate),
        loadInventoryForImages(),
        loadCatalogOptions(),
      ]);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setLoadErr(e?.response?.data?.message || e?.message || 'Could not load pricing catalog.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, canManagePricing, loadCatalogOptions, loadInventoryForImages]);

  useEffect(() => {
    loadPricing().catch(() => {});
  }, [loadPricing]);

  const brandOptions = useMemo(
    () =>
      buildPricingBrandOptions({
        customOptions: customCatalog,
        pricingRows: rows,
        currentBrand: form.brand,
      }),
    [customCatalog, rows, form.brand],
  );

  const productNameOptions = useMemo(
    () =>
      buildPricingProductNameOptions({
        brand: form.brand,
        customOptions: customCatalog,
        pricingRows: rows,
        currentProductName: form.productName,
      }).map((name) => ({ value: name, label: name })),
    [customCatalog, rows, form.brand, form.productName],
  );

  const capacityOptions = useMemo(() => {
    const current = String(form.capacity || '').trim().toUpperCase();
    if (current && !CAPACITY_OPTIONS.includes(current)) {
      return [current, ...CAPACITY_OPTIONS];
    }
    return CAPACITY_OPTIONS;
  }, [form.capacity]);

  const handleBrandChange = (value) => {
    setProductAddOpen(false);
    setProductAddDraft('');
    setForm((prev) => {
      const brand = normalizeBrandValue(value);
      if (!brand) return { ...prev, brand: '', productName: '' };
      const names = buildPricingProductNameOptions({
        brand,
        customOptions: customCatalog,
        pricingRows: rows,
        currentProductName: '',
      });
      const keepName = names.includes(String(prev.productName || '').trim()) ? prev.productName : '';
      return { ...prev, brand, productName: keepName };
    });
  };

  const handleProductNameChange = (value) => {
    setForm((prev) => ({ ...prev, productName: value }));
  };

  const confirmAddBrand = async () => {
    const brand = normalizeBrandValue(brandAddDraft);
    if (!brand) {
      setFormErr('Enter a brand name.');
      return;
    }
    if (!canManagePricing) {
      setFormErr('Only admins can add brands.');
      return;
    }
    try {
      const saved = await addPricingCatalogBrand(axiosPrivate, brand);
      setCustomCatalog(saved);
      notifyPricingCatalogOptionsUpdated();
      setForm((prev) => ({ ...prev, brand, productName: '' }));
      setBrandAddDraft('');
      setBrandAddOpen(false);
      setFormErr('');
    } catch (e) {
      setFormErr(e?.response?.data?.message || e?.message || 'Could not save brand.');
    }
  };

  const confirmAddProductName = async () => {
    const brand = normalizeBrandValue(form.brand);
    const name = String(productAddDraft || '').trim();
    if (!brand) {
      setFormErr('Select a brand first.');
      return;
    }
    if (!name) {
      setFormErr('Enter a product name.');
      return;
    }
    if (!canManagePricing) {
      setFormErr('Only admins can add models.');
      return;
    }
    try {
      const saved = await addPricingCatalogProductName(axiosPrivate, brand, name);
      setCustomCatalog(saved);
      notifyPricingCatalogOptionsUpdated();
      setForm((prev) => ({ ...prev, productName: name }));
      setProductAddDraft('');
      setProductAddOpen(false);
      setFormErr('');
    } catch (e) {
      setFormErr(e?.response?.data?.message || e?.message || 'Could not save product model.');
    }
  };

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.productName, row.brand, row.capacity].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, searchQuery]);

  const rowDisplayImages = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const key =
        rowId(row) ||
        productPricingCatalogKey({
          product_name: row?.productName,
          brand: row?.brand,
          capacity: row?.capacity,
        });
      map.set(key, resolvePricingRowDisplayImage(row, inventoryProducts));
    }
    return map;
  }, [rows, inventoryProducts]);

  const openCreate = () => {
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setFormErr('');
    setBrandAddOpen(false);
    setBrandAddDraft('');
    setProductAddOpen(false);
    setProductAddDraft('');
    resetImageState(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setForm({
      productName: row.productName || '',
      brand: normalizeBrandValue(row.brand),
      capacity: String(row.capacity || '').trim().toUpperCase(),
      retailPrice: row.retailPrice != null ? String(row.retailPrice) : '',
      wholesalePrice: row.wholesalePrice != null ? String(row.wholesalePrice) : '',
    });
    setFormErr('');
    resetImageState(row);
    setFormOpen(true);
  };

  const closeForm = () => {
    if (formSubmitting) return;
    setFormOpen(false);
    setEditingRow(null);
    setFormErr('');
    setBrandAddOpen(false);
    setBrandAddDraft('');
    setProductAddOpen(false);
    setProductAddDraft('');
    resetImageState(null);
  };

  const removeExistingImage = (publicId) => {
    const key = String(publicId || '').trim();
    if (!key) return;
    setRemovedImagePublicIds((prev) => new Set([...prev, key]));
  };

  const removeNewImage = (index) => {
    setNewImages((prev) => prev.filter((_, i) => i !== index));
    setNewImagePreviews((prev) => {
      const url = prev[index];
      if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const clearAllImages = () => {
    setRemovedImagePublicIds(new Set(existingImages.map((img) => String(img.publicId || img.url || ''))));
    setNewImages([]);
    setNewImagePreviews((prev) => {
      prev.forEach((url) => {
        if (url && url.startsWith('blob:')) URL.revokeObjectURL(url);
      });
      return [];
    });
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormErr('');
    setSaveOk('');
    try {
      const payload = {
        productName: form.productName.trim(),
        brand: form.brand.trim().toUpperCase(),
        capacity: form.capacity.trim().toUpperCase(),
        retailPrice: Number(form.retailPrice),
        wholesalePrice: form.wholesalePrice !== '' ? Number(form.wholesalePrice) : null,
      };

      const uploadOpts = {
        imageFiles: newImages,
        clearImage: totalImageCount === 0 && existingImages.length > 0,
        removeImagePublicIds: [...removedImagePublicIds],
      };

      let saved;
      if (editingRow) {
        saved = await updatePricingEntry(axiosPrivate, rowId(editingRow), payload, uploadOpts);
      } else {
        saved = await createPricingEntry(axiosPrivate, payload, uploadOpts);
      }

      const savedHasImages =
        (Array.isArray(saved?.images) && saved.images.some((img) => String(img?.url || '').trim())) ||
        Boolean(String(saved?.imageUrl || '').trim());

      if (newImages.length && !savedHasImages) {
        throw new Error(
          'Prices were saved but the product images could not be uploaded. Make sure the backend is running the latest version (POST /api/pricing/:id/image) and try again.',
        );
      }

      setSaveOk(editingRow ? 'Pricing updated.' : 'Product added to pricing catalog.');

      if (saved?.id) {
        const savedId = String(saved.id);
        setRows((prev) => {
          const list = Array.isArray(prev) ? [...prev] : [];
          const idx = list.findIndex((r) => rowId(r) === savedId);
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...saved };
            return list;
          }
          return [saved, ...list];
        });
      }

      setFormOpen(false);
      setEditingRow(null);
      resetImageState(null);
      await loadPricing();
    } catch (err) {
      setFormErr(err?.response?.data?.message || err?.message || 'Could not save pricing.');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="admin-direct-sale-pricing">
      <div className="admin-direct-sale-pricing__head">
        <div>
          <h3>Product pricing catalog</h3>
          <p className="admin-direct-sale-hint">
            {canManagePricing
              ? 'Set retail and vendor prices plus a default product photo by name, brand, and capacity. The photo is applied automatically when inventory is uploaded without images.'
              : 'Browse retail and vendor prices. Search by product name, brand, or capacity.'}
          </p>
        </div>
        <div className="admin-direct-sale-pricing__head-actions">
          {canManagePricing ? (
            <button
              type="button"
              className="admin-direct-sale-btn admin-direct-sale-btn--primary"
              onClick={openCreate}
            >
              Add product
            </button>
          ) : null}
          <button
            type="button"
            className="admin-direct-sale-btn admin-direct-sale-btn--ghost"
            onClick={() => loadPricing().catch(() => {})}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      {saveOk ? (
        <p className="admin-direct-sale-alert admin-direct-sale-alert--ok">{saveOk}</p>
      ) : null}
      {loadErr ? (
        <p className="admin-direct-sale-alert admin-direct-sale-alert--error">
          {loadErr.includes('404')
            ? 'Pricing API not found — restart or redeploy the backend server so /api/pricing is available.'
            : loadErr}
        </p>
      ) : null}

      <label className="admin-direct-sale-field admin-direct-sale-pricing__search">
        <span>Search products</span>
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="e.g. iPhone 15, Samsung, 256GB…"
          autoComplete="off"
        />
      </label>

      {loading ? <p className="admin-direct-sale-hint">Loading pricing catalog…</p> : null}

      {!loading && filteredRows.length === 0 ? (
        <p className="admin-direct-sale-hint">
          {searchQuery.trim()
            ? `No products match "${searchQuery.trim()}".`
            : canManagePricing
              ? 'No pricing entries yet. Add a product to get started.'
              : 'No pricing entries found.'}
        </p>
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <>
          <p className="admin-direct-sale-pricing__scroll-hint" aria-hidden="true">
            Swipe sideways to see all columns on smaller screens.
          </p>
          <div className="sales-table-wrap admin-direct-sale-pricing__table-wrap">
          <table className="sales-table admin-direct-sale-pricing__table">
            <thead>
              <tr>
                <th className="admin-direct-sale-pricing__col-image">Image</th>
                <th className="admin-direct-sale-pricing__col-product">Product name</th>
                <th className="admin-direct-sale-pricing__col-brand">Brand</th>
                <th className="admin-direct-sale-pricing__col-capacity">Capacity</th>
                <th className="admin-direct-sale-pricing__col-price">Retail price</th>
                <th className="admin-direct-sale-pricing__col-price">Vendor price</th>
                {canManagePricing ? (
                  <th className="admin-direct-sale-pricing__col-actions">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const rowKey =
                  rowId(row) ||
                  productPricingCatalogKey({
                    product_name: row?.productName,
                    brand: row?.brand,
                    capacity: row?.capacity,
                  });
                const displayImageUrl = rowDisplayImages.get(rowKey) || '';

                return (
                <tr key={rowKey || `${row.productName}-${row.brand}-${row.capacity}`}>
                  <td className="admin-direct-sale-pricing__col-image" data-label="Image">
                    {displayImageUrl ? (
                      <img
                        src={displayImageUrl}
                        alt={row.imageAlt || row.productName || 'Product'}
                        className="admin-direct-sale-pricing__thumb"
                      />
                    ) : (
                      <span className="admin-direct-sale-pricing__dash">—</span>
                    )}
                  </td>
                  <td
                    className="admin-direct-sale-pricing__col-product"
                    data-label="Product"
                  >
                    <strong>{row.productName}</strong>
                  </td>
                  <td className="admin-direct-sale-pricing__col-brand" data-label="Brand">
                    {row.brand || '—'}
                  </td>
                  <td className="admin-direct-sale-pricing__col-capacity" data-label="Capacity">
                    {row.capacity || '—'}
                  </td>
                  <td className="admin-direct-sale-pricing__col-price fit-numeric-cell" data-label="Retail price">
                    {row.retailPrice > 0 ? <MoneyXaf value={row.retailPrice} /> : '—'}
                  </td>
                  <td className="admin-direct-sale-pricing__col-price fit-numeric-cell" data-label="Vendor price">
                    {row.wholesalePrice > 0 ? <MoneyXaf value={row.wholesalePrice} /> : '—'}
                  </td>
                  {canManagePricing ? (
                    <td className="admin-direct-sale-pricing__col-actions" data-label="Actions">
                      <button
                        type="button"
                        className="admin-direct-sale-pricing__edit-btn"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              );
              })}
            </tbody>
          </table>
          </div>
          <p className="admin-direct-sale-hint admin-direct-sale-pricing__count">
            {filteredRows.length} product{filteredRows.length === 1 ? '' : 's'}
            {searchQuery.trim() ? ` matching "${searchQuery.trim()}"` : ''}
          </p>
        </>
      ) : null}

      <AppModal
        open={formOpen}
        title={editingRow ? 'Edit pricing' : 'Add product to pricing'}
        onClose={closeForm}
        footer={
          <>
            <button
              type="button"
              className="app-dialog__btn"
              onClick={closeForm}
              disabled={formSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="direct-sale-pricing-form"
              className="app-dialog__btn app-dialog__btn--primary"
              disabled={formSubmitting}
            >
              {formSubmitting ? 'Saving…' : editingRow ? 'Save changes' : 'Add product'}
            </button>
          </>
        }
      >
        <form id="direct-sale-pricing-form" className="admin-direct-sale-pricing__form" onSubmit={submitForm}>
          <PricingCatalogPick
            label="Brand"
            emptyLabel="Select brand…"
            value={form.brand}
            onChange={handleBrandChange}
            options={brandOptions}
            disabled={catalogOptionsLoading}
            addLabel="Add brand"
            addOpen={brandAddOpen}
            addDraft={brandAddDraft}
            onAddDraftChange={setBrandAddDraft}
            onAddOpen={() => {
              if (!canManagePricing) return;
              setBrandAddOpen(true);
              setProductAddOpen(false);
            }}
            onAddCancel={() => {
              setBrandAddOpen(false);
              setBrandAddDraft('');
            }}
            onAddConfirm={() => void confirmAddBrand()}
            addPlaceholder="New brand name"
            showAdd={canManagePricing}
          />
          <PricingCatalogPick
            label="Product name"
            emptyLabel={form.brand ? 'Select model…' : 'Select brand first…'}
            value={form.productName}
            onChange={handleProductNameChange}
            options={productNameOptions}
            disabled={!form.brand || catalogOptionsLoading}
            addLabel="Add model for this brand"
            addOpen={productAddOpen}
            addDraft={productAddDraft}
            onAddDraftChange={setProductAddDraft}
            onAddOpen={() => {
              if (!canManagePricing) return;
              if (!form.brand) {
                setFormErr('Select a brand before adding a model.');
                return;
              }
              setProductAddOpen(true);
              setBrandAddOpen(false);
            }}
            onAddCancel={() => {
              setProductAddOpen(false);
              setProductAddDraft('');
            }}
            onAddConfirm={() => void confirmAddProductName()}
            addPlaceholder={`New ${formatPricingBrandLabel(form.brand) || 'brand'} model`}
            showAdd={canManagePricing}
          />
          <label>
            Capacity
            <select
              value={form.capacity}
              onChange={(e) => setForm((prev) => ({ ...prev, capacity: e.target.value }))}
              required
            >
              <option value="">Select capacity…</option>
              {capacityOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Retail price (XAF)
            <input
              type="text"
              inputMode="numeric"
              value={form.retailPrice !== '' ? formatNumberWithCommas(form.retailPrice) : ''}
              onChange={(e) => {
                const parsed = parseFormattedNumber(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  retailPrice: parsed === '' ? '' : String(Math.max(0, Math.floor(Number(parsed)))),
                }));
              }}
              required
            />
          </label>
          <label>
            Vendor price (XAF)
            <input
              type="text"
              inputMode="numeric"
              value={form.wholesalePrice !== '' ? formatNumberWithCommas(form.wholesalePrice) : ''}
              onChange={(e) => {
                const parsed = parseFormattedNumber(e.target.value);
                setForm((prev) => ({
                  ...prev,
                  wholesalePrice: parsed === '' ? '' : String(Math.max(0, Math.floor(Number(parsed)))),
                }));
              }}
              placeholder="Shop listing price"
            />
          </label>
          {canManagePricing ? (
            <div className="admin-direct-sale-pricing__images">
              <span className="admin-direct-sale-pricing__image-label">Product images</span>
              <span className="admin-direct-sale-pricing__image-hint">
                Up to {MAX_PRICING_IMAGES} photos — same upload as Add to inventory. Used as default
                photos when stock is uploaded without images.
              </span>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                type="button"
                className={`admin-direct-sale-pricing__dropzone ${dragOver ? 'is-dragover' : ''}`}
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
                onClick={() => imageInputRef.current?.click()}
                disabled={!canAddMoreImages}
              >
                {canAddMoreImages
                  ? `Drop images or click to browse (${totalImageCount}/${MAX_PRICING_IMAGES})`
                  : `Maximum ${MAX_PRICING_IMAGES} images reached`}
              </button>
              {newImages.length > 0 ? (
                <ul className="admin-direct-sale-pricing__file-list">
                  {newImages.map((f, idx) => (
                    <li key={`${f.name}-${idx}`}>
                      <span>{f.name}</span>
                      <button type="button" onClick={() => removeNewImage(idx)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {(existingImages.length > 0 || newImages.length > 0) && (
                <div className="admin-direct-sale-pricing__image-preview-wrap">
                  {existingImages.map((img) => {
                    const key = String(img.publicId || img.url || '');
                    if (removedImagePublicIds.has(key)) return null;
                    return (
                      <div key={key} className="admin-direct-sale-pricing__image-preview-item">
                        <img
                          src={img.url}
                          alt={img.alt || 'Existing pricing image'}
                          className="admin-direct-sale-pricing__image-preview"
                        />
                        <button
                          type="button"
                          className="admin-direct-sale-pricing__remove-image"
                          onClick={() => removeExistingImage(key)}
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })}
                  {newImagePreviews.map((previewUrl, idx) => (
                    <div key={`new-${previewUrl}-${idx}`} className="admin-direct-sale-pricing__image-preview-item">
                      <img
                        src={previewUrl}
                        alt={`New pricing image ${idx + 1}`}
                        className="admin-direct-sale-pricing__image-preview"
                      />
                      <button
                        type="button"
                        className="admin-direct-sale-pricing__remove-image"
                        onClick={() => removeNewImage(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {totalImageCount > 0 ? (
                <button
                  type="button"
                  className="admin-direct-sale-pricing__clear-images"
                  onClick={clearAllImages}
                >
                  Remove all images
                </button>
              ) : null}
            </div>
          ) : null}
          {formErr ? (
            <p className="admin-direct-sale-alert admin-direct-sale-alert--error">{formErr}</p>
          ) : null}
        </form>
      </AppModal>
    </div>
  );
}
