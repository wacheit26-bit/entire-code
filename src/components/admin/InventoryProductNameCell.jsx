import {
  inventoryRowKey,
  inventoryStorageOptionsForRow,
  pickInventoryCapacityVariant,
} from '../../utils/mergeInventoryProducts';
import './InventoryPanel.css';

function normText(v) {
  return String(v || '').trim().toLowerCase();
}

export default function InventoryProductNameCell({
  row,
  productName,
  hint = null,
  inlineStoragePickerKey = '',
  expandedStorageSelection = { rowKey: '', capacity: '' },
  onProductSelect,
  onStorageSelect,
  getStorageCount,
  title = 'Show storage options and unit list',
}) {
  const rowKey = inventoryRowKey(row);
  const storageOptions = inventoryStorageOptionsForRow(row);
  const isStorageListOpen = inlineStoragePickerKey === rowKey && storageOptions.length > 1;
  const isRowExpanded = expandedStorageSelection.rowKey === rowKey;
  const chevronOpen = isStorageListOpen || isRowExpanded;
  const showChevron = storageOptions.length > 0;

  const resolveCount = (cap) => {
    if (typeof getStorageCount === 'function') return getStorageCount(row, cap);
    return pickInventoryCapacityVariant(row, cap).stock;
  };

  return (
    <div className="wh-inventory-product-cell">
      <button
        type="button"
        className="wh-inventory-product-link"
        onClick={() => onProductSelect?.(row)}
        title={title}
        aria-expanded={chevronOpen}
      >
        <span className="wh-inventory-product-link__label">{productName || '—'}</span>
        {showChevron ? (
          <span
            className={`wh-inventory-product-link__chevron ${chevronOpen ? 'is-open' : ''}`}
            aria-hidden
          >
            ▾
          </span>
        ) : null}
      </button>
      {hint ? <span className="wh-inventory-product-link__hint">{hint}</span> : null}
      {isStorageListOpen ? (
        <div
          className="wh-inventory-inline-storage-list"
          role="listbox"
          aria-label={`Storage options for ${productName || 'product'}`}
        >
          {storageOptions.map((cap) => {
            const isActive =
              expandedStorageSelection.rowKey === rowKey &&
              normText(expandedStorageSelection.capacity) === normText(cap);
            return (
              <button
                key={cap}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`wh-inventory-inline-storage-item ${isActive ? 'is-active' : ''}`}
                onClick={() => onStorageSelect?.(row, cap)}
              >
                {cap}
                <span className="wh-inventory-inline-storage-item__count">{resolveCount(cap)}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
