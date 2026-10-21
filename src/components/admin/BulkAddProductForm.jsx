import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { bulkCreateProducts } from '../../api/productsApi';
import { fetchPricingCatalog, fetchPricingCatalogOptions } from '../../api/pricingApi';
import { fetchWarehouses, pickDefaultMainId, warehouseId } from '../../api/warehouseApi';
import {
  notifyProductCatalogUpdated,
  subscribePricingCatalogOptionsUpdated,
} from '../../utils/productCatalogEvents';
import {
  applyCatalogPricesToBulkRow,
  buildPricingCatalogLookup,
} from '../../utils/inventoryPricingDisplay';
import {
  buildPricingBrandOptions,
  buildPricingProductNameOptions,
  EMPTY_PRICING_CATALOG_OPTIONS,
} from '../../utils/pricingCatalogOptions';
import './AddProductForm.css';

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

function uploadModeFor({ usaMode, regionalMode }) {
  if (usaMode) return 'usa';
  if (regionalMode) return 'regional';
  return 'legacy';
}

function emptyRow(mode = 'legacy') {
  return {
    product_type: 'Smartphone',
    brand: '',
    product_name: '',
    phoneLocation: mode === 'regional' ? 'Douala' : 'Other',
    capacity: '',
    country: mode === 'usa' ? 'USA' : '',
    sim: '',
    color: '',
    stock: 1,
    price: '',
    wholesalePrice: '',
    retailPrice: '',
    costPrice: '',
    priceMin: '',
    priceMax: '',
    imeCodesText: '',
    description: '',
  };
}

function parseImeLines(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isCompleteRow(row, mode) {
  const base =
    row.product_name.trim() &&
    row.brand.trim() &&
    row.capacity.trim() &&
    row.country.trim() &&
    row.sim.trim() &&
    row.color.trim() &&
    Number(row.stock) >= 1;

  if (!base) return false;

  const stock = Math.max(1, Math.floor(Number(row.stock) || 0));
  const codes = parseImeLines(row.imeCodesText);

  if (mode === 'usa') {
    return (
      row.costPrice !== '' &&
      Number(row.costPrice) >= 0 &&
      codes.length === stock
    );
  }

  if (mode === 'regional') {
    const wholesale = Number(row.wholesalePrice ?? row.price);
    return wholesale > 0 && codes.length === stock;
  }

  return (
    row.description.trim() &&
    Number(row.price) >= 0 &&
    Number(row.stock) >= 0
  );
}

function autoRowDescription(row) {
  const manual = String(row.description || '').trim();
  if (manual) return manual;
  return [row.product_name, row.capacity, row.color].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export default function BulkAddProductForm({
  onProductsCreated,
  fixedMainWarehouseId = '',
  fixedUploadWarehouseId = '',
  warehouseName = '',
  usaMode = false,
  regionalMode = false,
  embedded = false,
  catalogOptions: catalogOptionsProp = null,
  pricingCatalog: pricingCatalogProp = null,
}) {
  const mode = uploadModeFor({ usaMode, regionalMode });
  const axiosPrivate = useAxiosPrivate();
  const [rows, setRows] = useState([emptyRow(mode), emptyRow(mode), emptyRow(mode)]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rowErrors, setRowErrors] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(mode !== 'regional');
  const [warehousesError, setWarehousesError] = useState('');
  const [mainWarehouses, setMainWarehouses] = useState([]);
  const [selectedMainId, setSelectedMainId] = useState('');
  const [pricingCatalogLocal, setPricingCatalogLocal] = useState([]);
  const [catalogOptionsLocal, setCatalogOptionsLocal] = useState(EMPTY_PRICING_CATALOG_OPTIONS);

  const pricingCatalog = pricingCatalogProp ?? pricingCatalogLocal;
  const catalogOptions = catalogOptionsProp ?? catalogOptionsLocal;

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
      setPricingCatalogLocal(Array.isArray(rows) ? rows : []);
      setCatalogOptionsLocal(options || EMPTY_PRICING_CATALOG_OPTIONS);
    } catch {
      setPricingCatalogLocal([]);
      setCatalogOptionsLocal(EMPTY_PRICING_CATALOG_OPTIONS);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    if (catalogOptionsProp != null && pricingCatalogProp != null) return undefined;
    let cancelled = false;
    reloadPricingSources().catch(() => {
      if (!cancelled) {
        setPricingCatalogLocal([]);
        setCatalogOptionsLocal(EMPTY_PRICING_CATALOG_OPTIONS);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadPricingSources, catalogOptionsProp, pricingCatalogProp]);

  useEffect(() => {
    if (catalogOptionsProp != null && pricingCatalogProp != null) return undefined;
    return subscribePricingCatalogOptionsUpdated(() => {
      reloadPricingSources().catch(() => {});
    });
  }, [reloadPricingSources, catalogOptionsProp, pricingCatalogProp]);

  const brandOptions = useMemo(
    () =>
      buildPricingBrandOptions({
        customOptions: catalogOptions,
        pricingRows: pricingCatalog,
      }),
    [catalogOptions, pricingCatalog],
  );

  useEffect(() => {
    if (!pricingCatalog.length && !pricingLookup.size) return undefined;
    setRows((prev) =>
      prev.map((row) =>
        applyCatalogPricesToBulkRow(row, pricingLookup, {
          force: false,
          catalogRows: pricingCatalog,
        }),
      ),
    );
  }, [pricingCatalog, pricingLookup]);

  const selectedMain = useMemo(
    () => mainWarehouses.find((m) => warehouseId(m) === selectedMainId) || null,
    [mainWarehouses, selectedMainId],
  );

  const loadWarehouses = useCallback(async () => {
    if (mode === 'regional') return;
    setWarehousesLoading(true);
    setWarehousesError('');
    try {
      const data = await fetchWarehouses(axiosPrivate);
      const mains = Array.isArray(data.mainWarehouses) ? data.mainWarehouses : [];
      setMainWarehouses(mains);
      setSelectedMainId((prev) => {
        const fixed = String(fixedMainWarehouseId || '').trim();
        if (fixed && mains.some((m) => warehouseId(m) === fixed)) return fixed;
        return pickDefaultMainId(mains, prev);
      });
    } catch (err) {
      setMainWarehouses([]);
      setSelectedMainId('');
      setWarehousesError(
        err?.response?.data?.message || err?.message || 'Could not load warehouses.',
      );
    } finally {
      setWarehousesLoading(false);
    }
  }, [axiosPrivate, fixedMainWarehouseId, mode]);

  useEffect(() => {
    loadWarehouses();
  }, [loadWarehouses]);

  const phoneOptionsForBrand = (brand, currentProductName = '') =>
    buildPricingProductNameOptions({
      brand,
      customOptions: catalogOptions,
      pricingRows: pricingCatalog,
      currentProductName,
    });

  const submissionRows = useMemo(
    () => rows.map((row, index) => ({ row, index })).filter(({ row }) => isCompleteRow(row, mode)),
    [rows, mode],
  );

  const incompleteWithData = useMemo(
    () =>
      rows.filter((row) => {
        const hasData =
          mode === 'usa' || mode === 'regional'
            ? Boolean(
                row.product_name.trim() ||
                  row.brand.trim() ||
                  row.capacity.trim() ||
                  (mode === 'usa' ? row.costPrice !== '' : row.wholesalePrice !== '' || row.price !== '') ||
                  row.imeCodesText.trim(),
              )
            : Boolean(
                row.product_name.trim() ||
                  row.brand.trim() ||
                  row.capacity.trim() ||
                  row.description.trim(),
              );
        return hasData && !isCompleteRow(row, mode);
      }).length,
    [rows, mode],
  );

  const lockedMainId = String(fixedMainWarehouseId || selectedMainId || '').trim();
  const lockedUploadId = String(fixedUploadWarehouseId || '').trim();

  const canSubmit =
    (mode === 'regional' ? !!lockedUploadId : !!lockedMainId && mainWarehouses.length > 0) &&
    submissionRows.length > 0 &&
    !loading &&
    (mode === 'regional' || !warehousesLoading);

  const updateRow = (index, key, value) => {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        let next = { ...row, [key]: value };
        if (
          (pricingCatalog.length || pricingLookup.size) &&
          (key === 'brand' || key === 'product_name' || key === 'capacity')
        ) {
          next = applyCatalogPricesToBulkRow(next, pricingLookup, {
            catalogRows: pricingCatalog,
          });
        }
        return next;
      }),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(mode)]);
  };

  const removeRow = (index) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const resetForm = () => {
    setRows([emptyRow(mode), emptyRow(mode), emptyRow(mode)]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setRowErrors([]);

    if (mode === 'regional') {
      if (!lockedUploadId) {
        setError('Warehouse is not selected for this bulk upload.');
        return;
      }
    } else if (!mainWarehouses.length) {
      setError('Create a regional main warehouse first (Warehouses tab).');
      return;
    } else if (!lockedMainId) {
      setError(
        mode === 'usa'
          ? 'Select the USA main warehouse for this bulk upload.'
          : 'Select the main warehouse for this bulk upload.',
      );
      return;
    }

    if (!submissionRows.length) {
      setError('Fill at least one complete product row to upload.');
      return;
    }

    setLoading(true);
    try {
      const products = submissionRows.map(({ row }) => {
        const stock = Math.max(1, Math.floor(Number(row.stock) || 0));
        const payload = {
          product_type: row.product_type,
          product_name: row.product_name.trim(),
          brand: row.brand.trim().toUpperCase(),
          phoneLocation: row.phoneLocation,
          capacity: row.capacity.trim().toUpperCase(),
          country: row.country.trim(),
          sim: row.sim.trim(),
          color: row.color.trim(),
          stock,
          description: mode === 'legacy' ? row.description.trim() : autoRowDescription(row),
        };
        if (mode === 'usa') {
          payload.costPrice = Math.max(0, Number(row.costPrice) || 0);
          payload.imeCodes = parseImeLines(row.imeCodesText);
        } else if (mode === 'regional') {
          payload.price = Math.max(0, Number(row.wholesalePrice ?? row.price) || 0);
          if (row.retailPrice !== '') {
            payload.retailPrice = Math.max(0, Number(row.retailPrice) || 0);
          }
          payload.imeCodes = parseImeLines(row.imeCodesText);
        } else {
          payload.price = Math.max(0, Number(row.price) || 0);
        }
        return payload;
      });

      const result = await bulkCreateProducts(axiosPrivate, {
        ...(mode === 'regional'
          ? { uploadWarehouse: lockedUploadId }
          : { mainWarehouse: lockedMainId }),
        products,
      });

      notifyProductCatalogUpdated();
      await onProductsCreated?.(result?.data ?? []);

      const failed = Number(result?.failed) || 0;
      const batchCode = result?.batchCode || result?.bulkShipment?.batchCode || '';
      const targetName =
        mode === 'regional'
          ? warehouseName || 'warehouse'
          : selectedMain?.name || 'main warehouse';
      setSuccess(
        failed > 0
          ? `Created ${result?.count ?? products.length} product(s) in batch ${batchCode || '—'}. ${failed} row(s) failed — see details below.`
          : batchCode
            ? `Bulk batch ${batchCode}: ${result?.count ?? products.length} product(s) added to ${targetName}. Add photos when ready to list on the Shop.`
            : `Created ${result?.count ?? products.length} product(s) at ${targetName}.`,
      );
      if (Array.isArray(result?.errors) && result.errors.length) {
        setRowErrors(result.errors);
      } else {
        resetForm();
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Bulk upload failed.');
      if (Array.isArray(err?.response?.data?.errors)) {
        setRowErrors(err.response.data.errors);
      }
    } finally {
      setLoading(false);
    }
  };

  const panelClass = embedded
    ? 'wh-panel add-inventory-panel bulk-add-panel bulk-add-panel--embedded'
    : 'dash-panel add-product-panel bulk-add-panel';

  const tableClass =
    mode === 'usa' || mode === 'regional'
      ? `bulk-add-table bulk-add-table--usa${mode === 'regional' ? ' bulk-add-table--regional' : ''}`
      : 'bulk-add-table';

  const title =
    mode === 'usa'
      ? 'Bulk upload (USA Warehouse)'
      : mode === 'regional'
        ? `Bulk upload (${warehouseName || 'Regional warehouse'})`
        : 'Bulk add to main warehouse';

  return (
    <section className={panelClass}>
      <h3>{title}</h3>
      <p className="add-product-sub">
        {mode === 'usa'
          ? 'Add many product lines at once. Each row needs cost price and one IME per unit. Photos are added after stock arrives.'
          : mode === 'regional'
            ? 'Add many product lines at once with vendor price and one IME per unit. Vendor and retail prices auto-fill from the pricing catalog when brand, model, and capacity match. Default photos from the catalog are applied on upload when no images are attached.'
            : 'Add many products at once without photos. Stock is on hand at the selected warehouse immediately.'}
      </p>

      {error && <p className="add-product-msg add-product-msg--err">{error}</p>}
      {success && <p className="add-product-msg add-product-msg--ok">{success}</p>}

      <form onSubmit={handleSubmit} className="add-product-grid">
        {mode !== 'regional' ? (
          <section className="add-card">
            <h4>Regional main warehouse</h4>
            {fixedMainWarehouseId ? (
              <p className="add-product-warehouse-hint">
                Receiving at <strong>{selectedMain?.name || 'USA main Warehouse'}</strong> (
                {selectedMain?.city || 'USA'}).
              </p>
            ) : (
              <label className="field">
                <span>Receive bulk stock at</span>
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
                        : mode === 'usa'
                          ? 'Select USA main warehouse…'
                          : 'Select regional main warehouse…'}
                  </option>
                  {(mode === 'usa'
                    ? mainWarehouses.filter((m) => m.city === 'USA')
                    : mainWarehouses
                  ).map((m) => {
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
            )}
            {warehousesError ? (
              <p className="add-product-msg add-product-msg--err">
                {warehousesError}{' '}
                <button type="button" className="btn-reset" onClick={() => loadWarehouses()}>
                  Retry
                </button>
              </p>
            ) : null}
            {!warehousesLoading && !warehousesError && mainWarehouses.length === 0 ? (
              <p className="add-product-warehouse-hint">
                No main Warehouses yet. Open the <strong>Warehouses</strong> tab to create one, then
                return here.
              </p>
            ) : null}
            <p className="add-product-warehouse-hint">
              Products in this upload are stored at{' '}
              <strong>{selectedMain?.name || 'the selected main Warehouse'}</strong> with batch
              tracking. Photos are added later under <strong>Warehouses → View products</strong>.
            </p>
          </section>
        ) : (
          <section className="add-card">
            <h4>Upload destination</h4>
            <p className="add-product-warehouse-hint">
              Stock is uploaded to <strong>{warehouseName || 'this warehouse'}</strong> and listed on
              the Shop when each row has a vendor price and photos are added. Prices are pulled from
              the <strong>Direct sale → Pricing</strong> catalog when product name, brand, and capacity
              match.
            </p>
          </section>
        )}

        <section className="add-card bulk-add-table-wrap">
          <div className="bulk-add-table-head">
            <h4>
              Product rows ({submissionRows.length} ready
              {incompleteWithData ? `, ${incompleteWithData} incomplete` : ''})
            </h4>
            <button type="button" className="btn-reset bulk-add-add-row" onClick={addRow}>
              + Add row
            </button>
          </div>
          <p className="bulk-add-scroll-hint" aria-hidden="true">
            Swipe sideways to see all columns on tablet, or scroll the table below.
          </p>

          <div className="bulk-add-table-scroll" tabIndex={0} role="region" aria-label="Bulk product rows">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className="bulk-add-col-row">#</th>
                  <th>Brand</th>
                  <th>Model</th>
                  <th>Type</th>
                  <th>Capacity</th>
                  <th>Color</th>
                  <th>Country</th>
                  <th>SIM</th>
                  <th>Location</th>
                  <th>Stock</th>
                  {mode === 'usa' ? (
                    <>
                      <th>Cost</th>
                      <th>IME codes</th>
                    </>
                  ) : null}
                  {mode === 'regional' ? (
                    <>
                      <th>Vendor</th>
                      <th>Retail</th>
                      <th>IME codes</th>
                    </>
                  ) : null}
                  {mode === 'legacy' ? (
                    <>
                      <th>Price</th>
                      <th>Description</th>
                    </>
                  ) : null}
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const phones = phoneOptionsForBrand(row.brand, row.product_name);
                  const rowReady = isCompleteRow(row, mode);
                  const imeCount = parseImeLines(row.imeCodesText).length;
                  const stockN = Math.max(0, Math.floor(Number(row.stock) || 0));
                  return (
                    <tr key={`bulk-row-${index}`} className={rowReady ? 'bulk-add-row--ready' : ''}>
                      <td data-label="Row" className="bulk-add-col-row">
                        <span className="bulk-add-row-num">#{index + 1}</span>
                      </td>
                      <td data-label="Brand">
                        <select
                          value={row.brand}
                          onChange={(e) => updateRow(index, 'brand', e.target.value)}
                        >
                          <option value="">Brand</option>
                          {brandOptions.map(({ value, label }) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Model">
                        <select
                          value={row.product_name}
                          onChange={(e) => updateRow(index, 'product_name', e.target.value)}
                        >
                          <option value="">Model</option>
                          {phones.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Type">
                        <select
                          value={row.product_type}
                          onChange={(e) => updateRow(index, 'product_type', e.target.value)}
                        >
                          {PRODUCT_TYPES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Capacity">
                        <select
                          value={row.capacity}
                          onChange={(e) => updateRow(index, 'capacity', e.target.value)}
                        >
                          <option value="">—</option>
                          {CAPACITY_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Color">
                        <input
                          value={row.color}
                          onChange={(e) => updateRow(index, 'color', e.target.value)}
                          placeholder="Color"
                        />
                      </td>
                      <td data-label="Country">
                        <select
                          value={row.country}
                          onChange={(e) => updateRow(index, 'country', e.target.value)}
                        >
                          <option value="">—</option>
                          {COUNTRIES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="SIM">
                        <select value={row.sim} onChange={(e) => updateRow(index, 'sim', e.target.value)}>
                          <option value="">—</option>
                          {SIM_TYPES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Location">
                        <select
                          value={row.phoneLocation}
                          onChange={(e) => updateRow(index, 'phoneLocation', e.target.value)}
                        >
                          {PHONE_LOCATION_OPTIONS.map(({ value, label }) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td data-label="Stock">
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={row.stock}
                          onChange={(e) => updateRow(index, 'stock', e.target.value)}
                        />
                      </td>
                      {mode === 'usa' ? (
                        <>
                          <td data-label="Cost">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={row.costPrice}
                              onChange={(e) => updateRow(index, 'costPrice', e.target.value)}
                              placeholder="Cost"
                            />
                          </td>
                          <td data-label="IME codes" className="bulk-add-cell-ime">
                            <textarea
                              rows={3}
                              value={row.imeCodesText}
                              onChange={(e) => updateRow(index, 'imeCodesText', e.target.value)}
                              placeholder={`${imeCount}/${stockN || '?'} IMEs — one per line`}
                              title="One IME per line"
                            />
                          </td>
                        </>
                      ) : null}
                      {mode === 'regional' ? (
                        <>
                          <td data-label="Vendor">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={row.wholesalePrice ?? row.price}
                              onChange={(e) => {
                                const v = e.target.value;
                                setRows((prev) =>
                                  prev.map((r, i) =>
                                    i === index ? { ...r, wholesalePrice: v, price: v } : r,
                                  ),
                                );
                              }}
                              placeholder="From catalog"
                              title="Auto-filled from pricing catalog when available"
                            />
                          </td>
                          <td data-label="Retail">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={row.retailPrice}
                              onChange={(e) => updateRow(index, 'retailPrice', e.target.value)}
                              placeholder="Optional"
                            />
                          </td>
                          <td data-label="IME codes" className="bulk-add-cell-ime">
                            <textarea
                              rows={3}
                              value={row.imeCodesText}
                              onChange={(e) => updateRow(index, 'imeCodesText', e.target.value)}
                              placeholder={`${imeCount}/${stockN || '?'} IMEs — one per line`}
                              title="One IME per line"
                            />
                          </td>
                        </>
                      ) : null}
                      {mode === 'legacy' ? (
                        <>
                          <td data-label="Price">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              inputMode="decimal"
                              value={row.price}
                              onChange={(e) => updateRow(index, 'price', e.target.value)}
                              placeholder="XAF"
                            />
                          </td>
                          <td data-label="Description" className="bulk-add-cell-desc">
                            <input
                              value={row.description}
                              onChange={(e) => updateRow(index, 'description', e.target.value)}
                              placeholder="Short description"
                            />
                          </td>
                        </>
                      ) : null}
                      <td data-label="Actions" className="bulk-add-cell-actions">
                        <button type="button" className="bulk-add-remove" onClick={() => removeRow(index)}>
                          Remove row
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rowErrors.length > 0 && (
            <ul className="bulk-add-errors">
              {rowErrors.map((err) => (
                <li key={`err-${err.index}-${err.message}`}>
                  Row {(err.index ?? 0) + 1}
                  {err.product_name ? ` (${err.product_name})` : ''}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="add-actions">
          <button type="submit" className="btn-upload" disabled={!canSubmit}>
            {loading ? 'Uploading…' : `Bulk upload ${submissionRows.length} product(s)`}
          </button>
        </div>
      </form>
    </section>
  );
}
