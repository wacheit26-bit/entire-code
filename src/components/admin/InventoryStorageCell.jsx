import { useState } from 'react';
import './InventoryPanel.css';

export default function InventoryStorageCell({
  options = [],
  value = '',
  onSelect,
  locked = false,
  productName = '',
}) {
  const list = [...new Set(options.map((c) => String(c || '').trim()).filter(Boolean))];

  if (!list.length) {
    return <span className="wh-inventory-storage-cell wh-inventory-storage-cell--empty">—</span>;
  }

  if (locked || list.length === 1) {
    const label = locked ? value || list[0] : list[0];
    return (
      <span className="wh-inventory-storage-pill" title={label}>
        {label}
      </span>
    );
  }

  const [browse, setBrowse] = useState('');

  return (
    <label className="wh-inventory-storage-cell">
      <span className="wh-inventory-storage-cell__sr">
        {productName ? `Storage options for ${productName}` : 'Storage options'}
      </span>
      <select
        className="wh-inventory-storage-select wh-inventory-storage-select--column"
        value={value || browse}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            setBrowse('');
            return;
          }
          setBrowse('');
          onSelect?.(next);
        }}
        onBlur={() => setBrowse('')}
        aria-label={
          productName
            ? `Choose storage for ${productName} (${list.length} available)`
            : `${list.length} storage options`
        }
      >
        <option value="">{list.length} storages</option>
        {list.map((cap) => (
          <option key={cap} value={cap}>
            {cap}
          </option>
        ))}
      </select>
    </label>
  );
}
