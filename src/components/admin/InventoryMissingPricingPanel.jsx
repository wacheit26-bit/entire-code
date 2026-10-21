import { useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchPricingCatalog } from '../../api/pricingApi';
import {
  filterProductsMissingPricingCatalog,
  productPricingCatalogKey,
} from '../../utils/pricingCatalogMatch';
import {
  formatInventoryCapacities,
  inventoryAreaCount,
  inventoryProductKey,
  mergeInventoryProducts,
} from '../../utils/mergeInventoryProducts';
import { productLocationDisplay } from '../../utils/productTravelRoute';
import './InventoryPanel.css';

function upperText(v) {
  const s = String(v ?? '').trim();
  if (!s) return '—';
  return s.toUpperCase();
}

function productShipmentStatus(p) {
  const s = String(p?.shipmentStatus || 'arrived').toLowerCase();
  return s === 'travelling' ? 'travelling' : 'arrived';
}

export default function InventoryMissingPricingPanel({
  products = [],
  loading = false,
  open = false,
  onToggleOpen,
}) {
  const axiosPrivate = useAxiosPrivate();
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    fetchPricingCatalog(axiosPrivate)
      .then((rows) => {
        if (!cancelled) setCatalogRows(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setCatalogRows([]);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  const missingProducts = useMemo(
    () => filterProductsMissingPricingCatalog(products, catalogRows),
    [products, catalogRows],
  );

  const rows = useMemo(
    () => mergeInventoryProducts(missingProducts),
    [missingProducts],
  );

  const summary = useMemo(() => {
    let totalUnits = 0;
    let totalLocations = 0;
    for (const row of rows) {
      totalUnits += Math.max(0, Number(row?.stock) || 0);
      totalLocations += inventoryAreaCount(row) || 0;
    }
    return {
      products: rows.length,
      lineItems: missingProducts.length,
      totalUnits,
      totalLocations,
    };
  }, [rows, missingProducts.length]);

  const count = summary.products;
  const panelLoading = loading || catalogLoading;

  return (
    <div className="wh-inventory-missing-photos wh-inventory-missing-pricing">
      <button
        type="button"
        className={`wh-inventory-missing-photos-badge ${open ? 'is-active' : ''} ${count > 0 ? 'has-items' : ''}`}
        onClick={() => onToggleOpen?.()}
        aria-expanded={open}
        aria-controls="inventory-missing-pricing-panel"
        title="Uploaded products without a pricing catalog entry"
      >
        <span className="wh-inventory-missing-photos-badge__icon" aria-hidden>
          💰
        </span>
        <span className="wh-inventory-missing-photos-badge__count">
          {panelLoading ? '—' : count}
        </span>
        <span className="wh-inventory-missing-photos-badge__label">Missing pricing</span>
      </button>

      {open ? (
        <section id="inventory-missing-pricing-panel" className="wh-panel wh-inventory-missing-photos-panel">
          <div className="wh-section-head">
            <div>
              <h3>Products missing pricing catalog entry</h3>
              <p className="wh-inventory-missing-photos-panel__lead">
                These uploaded products do not match any row in the retail pricing catalog. Matching
                ignores capitalization and treats the same product name and brand as priced even when
                storage sizes differ. Add a catalog row under Direct Sale → Pricing for anything still
                listed here.
              </p>
            </div>
            <span className="wh-location-row__count">
              {summary.products} product{summary.products === 1 ? '' : 's'} ·{' '}
              {summary.totalUnits.toLocaleString()} unit{summary.totalUnits === 1 ? '' : 's'} ·{' '}
              {summary.totalLocations} location{summary.totalLocations === 1 ? '' : 's'}
            </span>
          </div>

          {panelLoading ? (
            <p className="wh-empty">Loading products…</p>
          ) : rows.length === 0 ? (
            <p className="wh-empty">
              Every uploaded product has a matching pricing catalog entry.
            </p>
          ) : (
            <div className="wh-inventory-table-wrap inventory-table-viewport">
              <table className="wh-activity-table wh-inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Storage</th>
                    <th>Locations</th>
                    <th>Shipment</th>
                    <th>Units</th>
                    <th>Catalog key</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rowKey =
                      row.__inventoryKey ||
                      inventoryProductKey(row) ||
                      String(row?._id ?? row?.id ?? '');
                    const locations = Array.isArray(row?.locations) ? row.locations : [];
                    const primary = locations[0]?.product || row;
                    const areaCount = inventoryAreaCount(row);
                    const totalStock = Math.max(0, Number(row?.stock) || 0);
                    const multiLocation = areaCount > 1;

                    return (
                      <tr key={rowKey}>
                        <td>{upperText(row?.product_name || primary?.product_name)}</td>
                        <td>{upperText(row?.brand || primary?.brand)}</td>
                        <td>{upperText(formatInventoryCapacities(row))}</td>
                        <td>
                          {multiLocation ? (
                            <span>
                              {areaCount} location{areaCount === 1 ? '' : 's'} ·{' '}
                              <strong>{totalStock}</strong> unit{totalStock === 1 ? '' : 's'}
                            </span>
                          ) : (
                            productLocationDisplay(primary)
                          )}
                        </td>
                        <td>{productShipmentStatus(primary)}</td>
                        <td>
                          <strong>{totalStock}</strong>
                        </td>
                        <td>
                          <code className="wh-inventory-missing-pricing__key">
                            {productPricingCatalogKey(primary)}
                          </code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
