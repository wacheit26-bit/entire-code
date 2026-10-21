import {
  inventoryCapacityOptions,
  inventoryProductNameOptions,
} from '../../utils/mergeInventoryProducts';
import './InventoryFilters.css';

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

export default function InventoryFilters({
  rows = [],
  nameQuery = '',
  capacity = '',
  onNameQueryChange,
  onCapacityChange,
  idPrefix = 'inv',
}) {
  const nameOptions = inventoryProductNameOptions(rows);
  const rowsForCapacity = nameQuery
    ? rows.filter((row) => norm(row?.product_name) === norm(nameQuery))
    : rows;
  const capacityOptions = inventoryCapacityOptions(rowsForCapacity);

  return (
    <div className="inventory-filters">
      <label className="inventory-filters__field">
        <span className="inventory-filters__label">Product</span>
        <select
          className="inventory-filters__select"
          value={nameQuery}
          onChange={(e) => {
            onNameQueryChange?.(e.target.value);
            onCapacityChange?.('');
          }}
          aria-label="Filter inventory by product name"
          id={`${idPrefix}-product-filter`}
        >
          <option value="">All products</option>
          {nameOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="inventory-filters__field">
        <span className="inventory-filters__label">Storage</span>
        <select
          className="inventory-filters__select"
          value={capacity}
          onChange={(e) => onCapacityChange?.(e.target.value)}
          disabled={!nameQuery}
          aria-label="Filter inventory by storage"
          id={`${idPrefix}-capacity-filter`}
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
  );
}

export { inventoryCapacityOptions, inventoryProductNameOptions };
