import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  filterMergedInventory,
  formatInventoryCapacities,
  inventoryColorOptions,
  inventoryRowKey,
  mergeInventoryProducts,
  pickInventoryCapacityVariant,
} from '../../utils/mergeInventoryProducts';
import { inventoryRowImeCodes, inventoryRowUnitCount, inventoryUnitDetailRows } from '../../utils/productIme';
import { formatBatteryHealthLabel, formatInventoryBatteryHealth } from '../../utils/batteryHealth';
import MoneyXaf from '../MoneyXaf';
import { buildPricingCatalogLookup, resolveInventoryPricing } from '../../utils/inventoryPricingDisplay';
import { fetchPricingCatalog } from '../../api/pricingApi';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import InventoryFilters from '../sales/InventoryFilters';
import InventoryImeCell from './InventoryImeCell';
import InventoryColorCell from './InventoryColorCell';
import InventoryProductNameCell from './InventoryProductNameCell';
import useInventoryRowExpansion from '../../hooks/useInventoryRowExpansion';
import './InventoryPanel.css';
import '../sales/InventoryFilters.css';

function renderPriceCell(value, loading) {
  if (loading) return '…';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return <MoneyXaf value={n} />;
}

export default function UsaWarehouseInventoryTable({
  products = [],
  loading = false,
  loadingMessage = 'Loading inventory…',
  emptyMessage = 'No products with IME at this warehouse yet.',
  idPrefix = 'usa-inv',
  showCostPrice = true,
  /** viewport = fixed-height inner scroll; page = full height, main layout scrolls */
  tableScrollMode = 'viewport',
}) {
  const axiosPrivate = useAxiosPrivate();
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [pricingCatalogLoading, setPricingCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPricingCatalogLoading(true);
    fetchPricingCatalog(axiosPrivate)
      .then((rows) => {
        if (!cancelled) setPricingCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPricingCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setPricingCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  const pricingLookup = useMemo(
    () => buildPricingCatalogLookup(pricingCatalog),
    [pricingCatalog],
  );

  const {
    inlineStoragePickerKey,
    expandedStorageSelection,
    hideStockColorColumns,
    handleProductSelect,
    handleStorageSelect,
  } = useInventoryRowExpansion();

  const [nameQuery, setNameQuery] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('');

  const merged = useMemo(() => mergeInventoryProducts(products), [products]);

  const mergedWithIme = useMemo(
    () => merged.filter((row) => inventoryRowImeCodes(row).length > 0),
    [merged],
  );

  const filtered = useMemo(
    () =>
      filterMergedInventory(mergedWithIme, {
        nameQuery,
        capacity: capacityFilter,
        expandWithoutCapacity: false,
      }),
    [mergedWithIme, nameQuery, capacityFilter],
  );

  const visible = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const byName = String(a?.product_name || '').localeCompare(
        String(b?.product_name || ''),
        undefined,
        { sensitivity: 'base' },
      );
      if (byName !== 0) return byName;
      return String(a?.brand || '').localeCompare(String(b?.brand || ''), undefined, {
        sensitivity: 'base',
      });
    });
    return rows;
  }, [filtered]);

  if (loading) {
    return <p className="wh-empty">{loadingMessage}</p>;
  }

  return (
    <>
      {mergedWithIme.length > 0 ? (
        <InventoryFilters
          rows={mergedWithIme}
          nameQuery={nameQuery}
          capacity={capacityFilter}
          onNameQueryChange={setNameQuery}
          onCapacityChange={setCapacityFilter}
          idPrefix={idPrefix}
        />
      ) : null}

      {visible.length === 0 ? (
        <p className="warehouses-empty">{emptyMessage}</p>
      ) : (
        <div
          className={
            tableScrollMode === 'page'
              ? 'wh-inventory-table-wrap warehouse-hub__inventory-scroll'
              : 'wh-inventory-table-wrap inventory-table-viewport'
          }
        >
          <table className="wh-activity-table wh-inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Storage</th>
                {!hideStockColorColumns ? <th>Color</th> : null}
                {!hideStockColorColumns ? <th>Stock</th> : null}
                <th>Battery</th>
                <th>IMEs</th>
                <th>Status</th>
                {showCostPrice ? <th className="fit-numeric-cell">Cost price</th> : null}
                <th className="fit-numeric-cell">Retail price</th>
                <th className="fit-numeric-cell">Vendor price</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const rowKey = inventoryRowKey(row);
                const locations = Array.isArray(row.locations) ? row.locations : [];
                const primary = locations[0]?.product || row;
                const totalStock = inventoryRowUnitCount(row);
                const multiLocation = locations.length > 1;
                const imeCodes = inventoryRowImeCodes(row);
                const isRowExpanded = expandedStorageSelection.rowKey === rowKey;
                const expandedVariantForRow = isRowExpanded
                  ? pickInventoryCapacityVariant(row, expandedStorageSelection.capacity).row
                  : null;
                const unitRows = expandedVariantForRow
                  ? inventoryUnitDetailRows(expandedVariantForRow).filter((unit) =>
                      Boolean(String(unit?.ime || '').trim()),
                    )
                  : [];
                const wholesale = Number(primary?.price);
                const cost = Number(primary?.costPrice);
                const { retail, wholesale: resolvedWholesale } = resolveInventoryPricing(row, pricingLookup);
                const displayWholesale =
                  resolvedWholesale != null && resolvedWholesale > 0 ? resolvedWholesale : wholesale;

                return (
                  <Fragment key={rowKey}>
                    <tr className={isRowExpanded ? 'wh-inventory-row--expanded' : ''}>
                      <td>
                        <InventoryProductNameCell
                          row={row}
                          productName={row.product_name}
                          hint={
                            multiLocation
                              ? `${locations.length} areas · ${totalStock} units`
                              : null
                          }
                          inlineStoragePickerKey={inlineStoragePickerKey}
                          expandedStorageSelection={expandedStorageSelection}
                          onProductSelect={handleProductSelect}
                          onStorageSelect={handleStorageSelect}
                        />
                      </td>
                      <td>{row.brand || '—'}</td>
                      <td>{formatInventoryCapacities(row)}</td>
                      {!hideStockColorColumns ? (
                        <td className="wh-inventory-cell--color">
                          <InventoryColorCell colors={inventoryColorOptions(row)} />
                        </td>
                      ) : null}
                      {!hideStockColorColumns ? (
                        <td>
                          <strong>{totalStock}</strong>
                        </td>
                      ) : null}
                      <td>{formatInventoryBatteryHealth(row) || ''}</td>
                      <td>
                        <InventoryImeCell codes={imeCodes} />
                      </td>
                      <td>
                        <span className={`warehouses-status-badge warehouses-status-badge--${String(primary.shipmentStatus || 'arrived').toLowerCase()}`}>
                          {primary.shipmentStatus || 'arrived'}
                        </span>
                        {String(primary.shipmentStatus || 'arrived').toLowerCase() === 'travelling' ? (
                          <ProductTravelRoute
                            product={primary}
                            className="product-travel-route--block product-travel-route--compact"
                          />
                        ) : null}
                      </td>
                      {showCostPrice ? (
                        <td className="fit-numeric-cell">{renderPriceCell(cost, false)}</td>
                      ) : null}
                      <td className="fit-numeric-cell">{renderPriceCell(retail, pricingCatalogLoading)}</td>
                      <td className="fit-numeric-cell">{renderPriceCell(displayWholesale, pricingCatalogLoading)}</td>
                    </tr>
                    {isRowExpanded
                      ? unitRows.map((unit, unitIndex) => {
                          const unitProduct = unit?.product || expandedVariantForRow || primary;
                          const unitCost = Number(unitProduct?.costPrice);
                          const {
                            retail: unitRetail,
                            wholesale: unitWholesale,
                          } = resolveInventoryPricing(unitProduct, pricingLookup);
                          return (
                            <tr
                              key={`${rowKey}-${unit.rowKey || unitIndex}`}
                              className="wh-inventory-unit-row"
                            >
                              <td className="wh-inventory-unit-row__product">
                                <span className="wh-inventory-unit-row__marker" aria-hidden>
                                  ↳
                                </span>
                                Unit {unitIndex + 1}
                              </td>
                              <td>{row.brand || '—'}</td>
                              <td>{unit.capacity || expandedStorageSelection.capacity || '—'}</td>
                              {!hideStockColorColumns ? <td /> : null}
                              {!hideStockColorColumns ? <td /> : null}
                              <td>{formatBatteryHealthLabel(unitProduct?.batteryHealth) || ''}</td>
                              <td>
                                {unit.ime ? (
                                  <code className="wh-inventory-ime-chip">{unit.ime}</code>
                                ) : (
                                  <span className="wh-inventory-ime-cell--empty">No IME</span>
                                )}
                              </td>
                              <td>
                                <span className={`warehouses-status-badge warehouses-status-badge--${String(unit.shipment || primary.shipmentStatus || 'arrived').toLowerCase()}`}>
                                  {unit.shipment || primary.shipmentStatus || 'arrived'}
                                </span>
                              </td>
                              {showCostPrice ? (
                                <td className="fit-numeric-cell">{renderPriceCell(unitCost, false)}</td>
                              ) : null}
                              <td className="fit-numeric-cell">{renderPriceCell(unitRetail, pricingCatalogLoading)}</td>
                              <td className="fit-numeric-cell">{renderPriceCell(unitWholesale, pricingCatalogLoading)}</td>
                            </tr>
                          );
                        })
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
