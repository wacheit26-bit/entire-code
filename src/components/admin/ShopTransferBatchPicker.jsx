import { useMemo, useState } from 'react';
import { warehouseId } from '../../api/warehouseApi';
import {
  shopTransferBatchEntry,
  shopTransferBatchKey,
  shopTransferCapacityOptions,
  shopTransferProductImage,
  shopTransferProductNames,
  shopTransferUnitRows,
} from '../../utils/shopTransferProducts';
import './ShopTransferBatchPicker.css';

export default function ShopTransferBatchPicker({
  shops = [],
  shopId = '',
  onShopIdChange,
  products = [],
  savedBatch = [],
  onSavedBatchChange,
  disabled = false,
}) {
  const [productName, setProductName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [checkedKeys, setCheckedKeys] = useState([]);

  const shopSelected = Boolean(String(shopId || '').trim());
  const nameOptions = useMemo(() => shopTransferProductNames(products), [products]);
  const capacityOptions = useMemo(
    () => shopTransferCapacityOptions(products, productName),
    [products, productName],
  );
  const unitRows = useMemo(
    () => shopTransferUnitRows(products, productName, capacity),
    [products, productName, capacity],
  );
  const heroImage = useMemo(
    () => shopTransferProductImage(products, productName),
    [products, productName],
  );

  const savedKeySet = useMemo(
    () => new Set(savedBatch.map((row) => shopTransferBatchKey(row))),
    [savedBatch],
  );

  const selectableRowKeys = useMemo(
    () => unitRows.filter((row) => !savedKeySet.has(row.rowKey)).map((row) => row.rowKey),
    [unitRows, savedKeySet],
  );

  const allSelectableChecked =
    selectableRowKeys.length > 0
    && selectableRowKeys.every((key) => checkedKeys.includes(key));

  const showTable = shopSelected && Boolean(productName);

  const toggleChecked = (rowKey) => {
    const key = String(rowKey);
    setCheckedKeys((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  };

  const toggleSelectAll = () => {
    if (allSelectableChecked) {
      setCheckedKeys((prev) => prev.filter((key) => !selectableRowKeys.includes(key)));
      return;
    }
    setCheckedKeys((prev) => {
      const next = new Set(prev);
      for (const key of selectableRowKeys) next.add(key);
      return [...next];
    });
  };

  const handleShopChange = (value) => {
    onShopIdChange?.(value);
    setProductName('');
    setCapacity('');
    setCheckedKeys([]);
  };

  const handleNameChange = (value) => {
    setProductName(value);
    setCapacity('');
    setCheckedKeys([]);
  };

  const handleCapacityChange = (value) => {
    setCapacity(value);
    setCheckedKeys([]);
  };

  const addCheckedToBatch = () => {
    const toAdd = unitRows
      .filter((row) => checkedKeys.includes(row.rowKey) && !savedKeySet.has(row.rowKey))
      .map(shopTransferBatchEntry)
      .filter(Boolean);
    if (!toAdd.length) return;
    onSavedBatchChange?.([...savedBatch, ...toAdd]);
    setCheckedKeys([]);
  };

  const removeFromBatch = (rowKey) => {
    onSavedBatchChange?.(savedBatch.filter((row) => shopTransferBatchKey(row) !== rowKey));
  };

  const clearBatch = () => onSavedBatchChange?.([]);

  return (
    <div className="shop-transfer-picker">
      <div className="shop-transfer-picker__filters">
        <label>
          Destination Shop
          <select
            value={shopId}
            onChange={(e) => handleShopChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Select Shop…</option>
            {shops.map((s) => {
              const id = warehouseId(s);
              return (
                <option key={id} value={id}>
                  {s.name} — {s.city || 'Other'}
                </option>
              );
            })}
          </select>
        </label>
        <label>
          Product
          <select
            value={productName}
            onChange={(e) => handleNameChange(e.target.value)}
            disabled={disabled || !shopSelected || nameOptions.length === 0}
          >
            <option value="">
              {!shopSelected
                ? 'Select a Shop first…'
                : nameOptions.length === 0
                  ? 'No arrived products'
                  : 'Select product…'}
            </option>
            {nameOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Storage
          <select
            value={capacity}
            onChange={(e) => handleCapacityChange(e.target.value)}
            disabled={disabled || !productName || capacityOptions.length === 0}
          >
            <option value="">All storages</option>
            {capacityOptions.map((cap) => (
              <option key={cap} value={cap}>
                {cap}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!shopSelected ? (
        <p className="shop-transfer-picker__hint">Choose a destination Shop to begin.</p>
      ) : null}

      {shopSelected && !productName ? (
        <p className="shop-transfer-picker__hint">Choose a product to list available units.</p>
      ) : null}

      {showTable ? (
        <section className="shop-transfer-picker__table-panel">
          {heroImage ? (
            <img
              className="shop-transfer-picker__hero"
              src={heroImage}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : null}

          <div className="shop-transfer-picker__table-head">
            <h3>{productName}{capacity ? ` · ${capacity}` : ''}</h3>
            <div className="shop-transfer-picker__table-head-actions">
              {unitRows.length > 0 ? (
                <label className="shop-transfer-picker__select-all">
                  <input
                    type="checkbox"
                    checked={allSelectableChecked}
                    disabled={disabled || selectableRowKeys.length === 0}
                    onChange={toggleSelectAll}
                    aria-label="Select all available units in this listing"
                  />
                  Select all
                  {selectableRowKeys.length > 0 ? ` (${selectableRowKeys.length})` : ''}
                </label>
              ) : null}
              <span>
                {unitRows.length} unit{unitRows.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>

          {unitRows.length === 0 ? (
            <p className="shop-transfer-picker__empty">No arrived stock for this selection.</p>
          ) : (
            <>
              <div className="shop-transfer-picker__table-wrap">
                <table className="shop-transfer-picker__table">
                  <thead>
                    <tr>
                      <th style={{ width: '44px' }} aria-label="Select unit" />
                      <th>Product</th>
                      <th>Storage</th>
                      <th>IME</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitRows.map((row) => {
                      const inBatch = savedKeySet.has(row.rowKey);
                      const checked = checkedKeys.includes(row.rowKey);
                      return (
                        <tr key={row.rowKey} className={inBatch ? 'is-in-batch' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || inBatch}
                              onChange={() => toggleChecked(row.rowKey)}
                              aria-label={`Select ${row.product_name} ${row.capacity || ''} ${
                                row.ime || 'unit'
                              }`}
                            />
                          </td>
                          <td>
                            <strong>{row.product_name || '—'}</strong>
                            {row.brand ? (
                              <span className="shop-transfer-picker__meta">{row.brand}</span>
                            ) : null}
                            {inBatch ? (
                              <span className="shop-transfer-picker__badge">In saved batch</span>
                            ) : null}
                          </td>
                          <td>{row.capacity || '—'}</td>
                          <td>
                            {row.ime ? (
                              <code className="shop-transfer-picker__ime">{row.ime}</code>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="shop-transfer-picker__table-actions">
                <button
                  type="button"
                  className="wh-hero__btn"
                  disabled={disabled || checkedKeys.length === 0}
                  onClick={addCheckedToBatch}
                >
                  Add selected to transfer batch
                </button>
                <button
                  type="button"
                  className="wh-link"
                  disabled={disabled || checkedKeys.length === 0}
                  onClick={() => setCheckedKeys([])}
                >
                  Clear selection
                </button>
              </div>
            </>
          )}
        </section>
      ) : null}

      {savedBatch.length > 0 ? (
        <section className="shop-transfer-picker__saved">
          <div className="shop-transfer-picker__saved-head">
            <h3>Saved transfer batch</h3>
            <span>
              {savedBatch.length} unit{savedBatch.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="shop-transfer-picker__saved-list">
            {savedBatch.map((row) => (
              <li key={shopTransferBatchKey(row)}>
                <div>
                  <strong>{row.product_name}</strong>
                  <span className="shop-transfer-picker__meta">
                    {[row.brand, row.capacity, row.color].filter(Boolean).join(' · ')}
                    {row.ime ? ` · IME: ${row.ime}` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="wh-link"
                  disabled={disabled}
                  onClick={() => removeFromBatch(shopTransferBatchKey(row))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="wh-link shop-transfer-picker__clear-batch"
            disabled={disabled}
            onClick={clearBatch}
          >
            Clear saved batch
          </button>
        </section>
      ) : null}
    </div>
  );
}
