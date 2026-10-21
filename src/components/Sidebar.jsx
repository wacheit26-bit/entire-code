import { Fragment, useState } from 'react';
import './Sidebar.css';
import SidebarFeaturedSpotlight from './SidebarFeaturedSpotlight';
import { formatTitleCase } from '../utils/formatProductName';

const FILTER_SECTIONS = [
  { key: 'brand', label: 'Brand', options: [] },
  { key: 'capacity', label: 'Capacity', options: [] },
  { key: 'product_type', label: 'Product type', options: [] },
];

export default function Sidebar({
  onRequestPreorder,
  canRequestPreorder = false,
  filters,
  onFilterChange,
  brandOptions = [],
  capacityOptions = [],
  productTypeOptions = [],
  catalogProducts = [],
  productsLoading = false,
  onFeaturedAddToCart,
  canFeaturedAddToCart = true,
}) {
  const [expanded, setExpanded] = useState({
    priceRange: true,
  });

  const toggleFilter = (key, value) => {
    const current = filters[key] || [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFilterChange({ ...filters, [key]: next });
  };

  const setPrice = (field, raw) => {
    onFilterChange({ ...filters, [field]: raw === '' ? undefined : raw });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-preorder-block">
        <h2 className="sidebar-preorder-block__title">Preorder</h2>
        <p className="sidebar-preorder-block__intro">
          Request products that are not listed yet. You will be asked for name, quantity, brand, type, and a short
          description so we can process your request without back-and-forth.
        </p>
        <button
          type="button"
          className="sidebar-preorder-block__btn"
          onClick={() => onRequestPreorder?.()}
          disabled={!canRequestPreorder || !onRequestPreorder}
        >
          Start preorder request
        </button>
        {!canRequestPreorder ? (
          <p className="sidebar-preorder-block__hint">Available when your vendor account is active.</p>
        ) : null}
      </div>

      {FILTER_SECTIONS.map(({ key, label, options }) => {
        const resolvedOptions =
          key === 'brand'
            ? brandOptions
            : key === 'capacity'
              ? capacityOptions
              : key === 'product_type'
                ? productTypeOptions
                : options;

        if ((key === 'capacity' || key === 'product_type') && resolvedOptions.length === 0) {
          return null;
        }
        return (
          <Fragment key={key}>
            <div className="filter-section">
              <div className="filter-section-title" role="heading" aria-level={3}>
                {label}
              </div>
              <ul className="filter-options">
                {resolvedOptions.map((opt) => (
                  <li key={opt}>
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={(filters[key] || []).includes(opt)}
                        onChange={() => toggleFilter(key, opt)}
                      />
                      <span className="filter-option-label">{formatTitleCase(opt, String(opt || ''))}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            {key === 'brand' ? (
              <SidebarFeaturedSpotlight
                products={catalogProducts}
                loading={productsLoading}
                onAddToCart={onFeaturedAddToCart}
                canAddToCart={canFeaturedAddToCart}
              />
            ) : null}
          </Fragment>
        );
      })}

      <div className="filter-section">
        <button
          type="button"
          className="filter-section-header"
          onClick={() => setExpanded((e) => ({ ...e, priceRange: !e.priceRange }))}
          aria-expanded={expanded.priceRange}
        >
          Price range
        </button>
        {expanded.priceRange && (
          <div className="filter-price">
            <input
              type="number"
              min={0}
              placeholder="Min"
              value={filters.minPrice ?? ''}
              onChange={(e) => setPrice('minPrice', e.target.value)}
            />
            <span>–</span>
            <input
              type="number"
              min={0}
              placeholder="Max"
              value={filters.maxPrice ?? ''}
              onChange={(e) => setPrice('maxPrice', e.target.value)}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
