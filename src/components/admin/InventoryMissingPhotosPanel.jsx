import { useMemo } from 'react';
import {
  countPricingRowsMissingShopImages,
  filterPricingRowsMissingShopImages,
} from '../../utils/productCatalogImage';
import MoneyXaf from '../MoneyXaf';
import './InventoryPanel.css';

function upperText(v) {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  return s.toUpperCase();
}

function pricingRowKey(row) {
  return String(row?.id ?? row?._id ?? `${row?.productName}|${row?.brand}|${row?.capacity}`);
}

/** @deprecated Use countPricingRowsMissingShopImages — counts pricing catalog rows without photos. */
export function countProductsNeedingShopPhotos(_products = [], pricingCatalog = null) {
  return countPricingRowsMissingShopImages(pricingCatalog);
}

export default function InventoryMissingPhotosPanel({
  pricingCatalog = null,
  loading = false,
  open = false,
  onToggleOpen,
  onGoToDirectSalePricing,
}) {
  const rows = useMemo(
    () => filterPricingRowsMissingShopImages(pricingCatalog),
    [pricingCatalog],
  );

  const count = useMemo(
    () => countPricingRowsMissingShopImages(pricingCatalog),
    [pricingCatalog],
  );

  return (
    <div className="wh-inventory-missing-photos">
      <button
        type="button"
        className={`wh-inventory-missing-photos-badge ${open ? 'is-active' : ''} ${count > 0 ? 'has-items' : ''}`}
        onClick={() => onToggleOpen?.()}
        aria-expanded={open}
        aria-controls="inventory-missing-photos-panel"
        title="Direct Sales pricing products missing shop photos"
      >
        <span className="wh-inventory-missing-photos-badge__icon" aria-hidden>
          📷
        </span>
        <span className="wh-inventory-missing-photos-badge__count">{loading ? '—' : count}</span>
        <span className="wh-inventory-missing-photos-badge__label">Need Shop photos</span>
      </button>

      {open ? (
        <section id="inventory-missing-photos-panel" className="wh-panel wh-inventory-missing-photos-panel">
          <div className="wh-section-head">
            <div>
              <h3>Missing photos for vendor listing</h3>
              <p className="wh-inventory-missing-photos-panel__lead">
                These products are in the Direct Sales pricing catalog but do not have a shop photo
                yet. Inventory stock matching the same product name and capacity will not appear on
                the vendor shop until the photo is added under Direct Sales → Pricing.
              </p>
            </div>
            <span className="wh-location-row__count">
              {rows.length} product{rows.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <p className="wh-empty">Loading pricing catalog…</p>
          ) : rows.length === 0 ? (
            <p className="wh-empty">
              Every pricing catalog product has a shop photo. Vendor listings can use catalog images.
            </p>
          ) : (
            <div className="wh-inventory-table-wrap">
              <table className="wh-activity-table wh-inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Capacity</th>
                    <th className="fit-numeric-cell">Retail</th>
                    <th className="fit-numeric-cell">Wholesale</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={pricingRowKey(row)}>
                      <td>
                        <strong>{upperText(row?.productName)}</strong>
                      </td>
                      <td>{upperText(row?.brand)}</td>
                      <td>{row?.capacity || '—'}</td>
                      <td className="fit-numeric-cell">
                        {Number(row?.retailPrice) > 0 ? <MoneyXaf value={row.retailPrice} /> : '—'}
                      </td>
                      <td className="fit-numeric-cell">
                        {row?.wholesalePrice != null && row.wholesalePrice !== '' && Number(row.wholesalePrice) > 0
                          ? <MoneyXaf value={row.wholesalePrice} />
                          : '—'}
                      </td>
                      <td>
                        <div className="wh-inventory-table__actions">
                          <button
                            type="button"
                            className="wh-inventory-btn wh-inventory-btn--primary"
                            onClick={() => onGoToDirectSalePricing?.(row)}
                          >
                            Add photo in Pricing
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
