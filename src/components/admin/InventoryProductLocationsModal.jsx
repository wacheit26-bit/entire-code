import { AppModal } from '../AppDialog';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import InventoryImeCell from './InventoryImeCell';
import { formatTitleCase } from '../../utils/formatProductName';
import { resolveInventoryPricing } from '../../utils/inventoryPricingDisplay';
import { normalizedImeList, productLineUnitCount } from '../../utils/productIme';
import { locationProductLines } from '../../utils/mergeInventoryProducts';
import MoneyXaf from '../MoneyXaf';
import './InventoryProductLocationsModal.css';

function renderPriceValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return <MoneyXaf value={n} />;
}

export default function InventoryProductLocationsModal({
  row,
  pricingLookup = null,
  onClose,
  onEditProduct,
  onDeleteProduct,
  onMarkArrived,
  arrivingId = '',
  deletingId = '',
}) {
  if (!row) return null;

  const locations = Array.isArray(row?.locations) ? row.locations : [];
  const totalStock = locations.reduce((sum, loc) => sum + Math.max(0, Number(loc?.stock) || 0), 0);
  const rowPricing = resolveInventoryPricing(row, pricingLookup);
  const productTitle = formatTitleCase(row?.product_name || 'Product');

  const tableRows = [];
  for (const loc of locations) {
    const lines = locationProductLines(loc);
    const shipmentDefault = String(loc?.shipment || 'arrived').toLowerCase();
    if (!lines.length) continue;

    for (const line of lines) {
      const p = line || loc?.product || {};
      const pid = String(p?._id ?? p?.id ?? '').trim();
      if (!pid) continue;
      const shipment = String(p?.shipmentStatus || shipmentDefault).toLowerCase();
      const isBulk = Boolean(p?.bulkBatchCode || p?.bulkShipment);
      const travelling = shipment === 'travelling';
      const locPricing = resolveInventoryPricing(p, pricingLookup);
      const imeCodes = normalizedImeList(p);
      tableRows.push({
        key: `${loc.areaKey || loc.label}|${pid}`,
        loc,
        p,
        pid,
        shipment,
        isBulk,
        travelling,
        locPricing,
        imeCodes,
        units: Math.max(0, productLineUnitCount(p)),
      });
    }
  }

  return (
    <AppModal
      open
      title={`Locations — ${productTitle}`}
      onClose={onClose}
      wide
      dialogClassName="inv-loc-modal"
      footer={
        <button type="button" className="settings-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <p className="inv-loc-modal__meta">
        {formatTitleCase(row?.brand || '')}
        {row?.capacity ? ` · ${row.capacity}` : ''}
        {row?.color ? ` · ${row.color}` : ''}
      </p>
      <p className="inv-loc-modal__total">
        Total units across locations: <strong>{totalStock}</strong>
      </p>
      <p className="inv-loc-modal__pricing">
        Catalog retail: <strong>{renderPriceValue(rowPricing.retail)}</strong>
        {' · '}
        Vendor: <strong>{renderPriceValue(rowPricing.wholesale)}</strong>
      </p>

      {tableRows.length === 0 ? (
        <p className="inv-loc-modal__empty">No location data for this product.</p>
      ) : (
        <div className="inv-loc-modal__table-wrap">
          <table className="inv-loc-modal__table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Storage</th>
                <th>Status</th>
                <th>Units</th>
                <th>IMEs</th>
                <th className="fit-numeric-cell">Retail</th>
                <th className="fit-numeric-cell">Vendor</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ key, loc, p, pid, shipment, isBulk, travelling, locPricing, imeCodes, units }) => (
                <tr key={key}>
                  <td>
                    <span className="inv-loc-modal__area">{loc.label || '—'}</span>
                    {travelling ? (
                      <ProductTravelRoute
                        product={p}
                        className="product-travel-route--block product-travel-route--compact"
                      />
                    ) : null}
                  </td>
                  <td>{p?.capacity || loc?.capacity || '—'}</td>
                  <td>
                    <span
                      className={`wh-tag ${
                        travelling ? 'wh-tag--travel' : shipment === 'arrived' ? 'wh-tag--arrived' : ''
                      }`}
                    >
                      {shipment}
                    </span>
                  </td>
                  <td>
                    <strong>{units}</strong>
                  </td>
                  <td>
                    <InventoryImeCell codes={imeCodes} maxVisible={5} />
                  </td>
                  <td className="fit-numeric-cell">{renderPriceValue(locPricing.retail)}</td>
                  <td className="fit-numeric-cell">{renderPriceValue(locPricing.wholesale)}</td>
                  <td>
                    <div className="inv-loc-modal__actions">
                      {travelling && !isBulk ? (
                        <button
                          type="button"
                          className="wh-inventory-btn wh-inventory-btn--success"
                          disabled={arrivingId === pid}
                          onClick={() => onMarkArrived?.(pid)}
                        >
                          {arrivingId === pid ? 'Updating…' : 'Mark arrived'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="wh-inventory-btn wh-inventory-btn--primary"
                        onClick={() => onEditProduct?.(p)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="wh-inventory-btn wh-inventory-btn--danger"
                        disabled={deletingId === pid}
                        onClick={() => onDeleteProduct?.(pid, p?.product_name)}
                      >
                        {deletingId === pid ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppModal>
  );
}
