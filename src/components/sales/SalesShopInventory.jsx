import { Fragment, useMemo, useState } from 'react';
import {
  filterMergedInventory,
  formatInventoryCapacities,
  inventoryColorOptions,
  inventoryRowKey,
  mergeInventoryProducts,
  pickInventoryCapacityVariant,
} from '../../utils/mergeInventoryProducts';
import { inventoryRowImeCodes, inventoryRowUnitCount, inventoryUnitDetailRows } from '../../utils/productIme';
import { isProductTravelling, productLocationDisplay } from '../../utils/productTravelRoute';
import InventoryFilters from './InventoryFilters';
import InventoryImeCell from '../admin/InventoryImeCell';
import InventoryColorCell from '../admin/InventoryColorCell';
import InventoryProductNameCell from '../admin/InventoryProductNameCell';
import useInventoryRowExpansion from '../../hooks/useInventoryRowExpansion';
import '../admin/InventoryPanel.css';
import './InventoryFilters.css';

export default function SalesShopInventory({ shop, products = [], loading, scope = 'shop' }) {
  const {
    inlineStoragePickerKey,
    expandedStorageSelection,
    hideStockColorColumns,
    handleProductSelect,
    handleStorageSelect,
  } = useInventoryRowExpansion();

  const [nameQuery, setNameQuery] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('');

  const onHand = useMemo(
    () => (products || []).filter((p) => !isProductTravelling(p)),
    [products],
  );

  const merged = useMemo(() => mergeInventoryProducts(onHand), [onHand]);

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

  const isSystemScope = scope === 'system';

  if (loading) {
    return <p className="sales-hint">{isSystemScope ? 'Loading system inventory…' : 'Loading inventory…'}</p>;
  }

  return (
    <div className="sales-shop-inventory wh-panel">
      <header className="sales-shop-inventory__head">
        <h2>
          {isSystemScope
            ? 'System inventory — all warehouses & shops'
            : `On-hand inventory — ${shop?.name || 'Shop'}`}
        </h2>
        <p>
          {isSystemScope
            ? 'Click a product name, pick a storage, then review each unit and its IME across the platform.'
            : 'Click a product name, pick a storage, then review each unit and its IME.'}
        </p>
      </header>

      {mergedWithIme.length > 0 ? (
        <InventoryFilters
          rows={mergedWithIme}
          nameQuery={nameQuery}
          capacity={capacityFilter}
          onNameQueryChange={setNameQuery}
          onCapacityChange={setCapacityFilter}
          idPrefix="shop-inv"
        />
      ) : null}

      {visible.length === 0 ? (
        <p className="sales-hint">
          {isSystemScope
            ? 'No available products with IME found in warehouses or shops.'
            : 'No accepted products with IME at this shop yet.'}
        </p>
      ) : (
        <div className="wh-inventory-table-wrap inventory-table-viewport">
          <table className="wh-activity-table wh-inventory-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Storage</th>
                {!hideStockColorColumns ? <th>Color</th> : null}
                {!hideStockColorColumns ? <th>Stock</th> : null}
                <th>IMEs</th>
                <th>Status</th>
                <th>Location</th>
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
                      <td>
                        <InventoryImeCell codes={imeCodes} />
                      </td>
                      <td>{primary.shipmentStatus || 'arrived'}</td>
                      <td>
                        {multiLocation
                          ? `${locations.length} areas`
                          : locations[0]?.label || productLocationDisplay(primary)}
                      </td>
                    </tr>
                    {isRowExpanded
                      ? unitRows.map((unit, unitIndex) => (
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
                            <td>
                              {unit.ime ? (
                                <code className="wh-inventory-ime-chip">{unit.ime}</code>
                              ) : (
                                <span className="wh-inventory-ime-cell--empty">No IME</span>
                              )}
                            </td>
                            <td>{unit.shipment || 'arrived'}</td>
                            <td>{unit.area || productLocationDisplay(unit.product || primary)}</td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
