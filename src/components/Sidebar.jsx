import { useState } from 'react';
import './Sidebar.css';
import {
  manufacturers,
  models,
  capacities,
  colors,
  conditions,
  carriers,
} from '../data/products';

const FILTER_SECTIONS = [
  { key: 'manufacturer', label: 'Manufacturer', options: manufacturers },
  { key: 'model', label: 'Model', options: models },
  { key: 'capacity', label: 'Capacity', options: capacities },
  { key: 'color', label: 'Color', options: colors },
  { key: 'condition', label: 'Condition', options: conditions },
  { key: 'carrier', label: 'Carrier', options: carriers },
];

export default function Sidebar({ filterText, onFilterTextChange, filters, onFilterChange }) {
  const [expanded, setExpanded] = useState({
    ...FILTER_SECTIONS.reduce((acc, s) => ({ ...acc, [s.key]: true }), {}),
    priceRange: false,
  });

  const toggleSection = (key) => {
    setExpanded((e) => ({ ...e, [key]: !e[key] }));
  };

  const toggleFilter = (key, value) => {
    const current = filters[key] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange({ ...filters, [key]: next });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-filter-input">
        <label htmlFor="filter-search">Filter</label>
        <input
          id="filter-search"
          type="text"
          placeholder="Search..."
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
        />
      </div>

      {FILTER_SECTIONS.map(({ key, label, options }) => (
        <div key={key} className="filter-section">
          <button
            type="button"
            className="filter-section-header"
            onClick={() => toggleSection(key)}
            aria-expanded={expanded[key]}
          >
            {label}
          </button>
          {expanded[key] && (
            <ul className="filter-options">
              {options.map((opt) => (
                <li key={opt}>
                  <label className="filter-option">
                    <input
                      type="checkbox"
                      checked={(filters[key] || []).includes(opt)}
                      onChange={() => toggleFilter(key, opt)}
                    />
                    <span>{opt}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <div className="filter-section">
        <button
          type="button"
          className="filter-section-header"
          onClick={() => setExpanded((e) => ({ ...e, priceRange: !e.priceRange }))}
          aria-expanded={expanded.priceRange}
        >
          Price Range
        </button>
        {expanded.priceRange && (
          <div className="filter-price">
            <input type="number" placeholder="Min" />
            <span>–</span>
            <input type="number" placeholder="Max" />
          </div>
        )}
      </div>
    </aside>
  );
}
