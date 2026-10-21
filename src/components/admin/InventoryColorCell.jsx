import { useState } from 'react';
import './InventoryPanel.css';

function displayColor(value) {
  const s = String(value || '').trim();
  return s ? s.toUpperCase() : '—';
}

export default function InventoryColorCell({ colors = [] }) {
  const list = [...new Set(colors.map((c) => String(c || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
  const [selected, setSelected] = useState('');

  if (!list.length) {
    return <span className="wh-inventory-color-cell wh-inventory-color-cell--empty">—</span>;
  }

  if (list.length === 1) {
    return (
      <span className="wh-inventory-color-pill" title={displayColor(list[0])}>
        <span className="wh-inventory-color-pill__swatch" aria-hidden />
        {displayColor(list[0])}
      </span>
    );
  }

  return (
    <label className="wh-inventory-color-cell">
      <span className="wh-inventory-color-cell__sr">Colors</span>
      <select
        className="wh-inventory-color-select"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        onBlur={() => setSelected('')}
        aria-label={`${list.length} colors available`}
      >
        <option value="">{list.length} colors</option>
        {list.map((color) => (
          <option key={color} value={color}>
            {displayColor(color)}
          </option>
        ))}
      </select>
    </label>
  );
}
