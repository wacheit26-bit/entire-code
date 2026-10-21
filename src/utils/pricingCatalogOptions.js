import {
  ADMIN_BRAND_OPTIONS,
  ADMIN_PHONES_BY_BRAND,
} from '../data/adminAddProductCatalog';

export const PRICING_CATALOG_OPTIONS_STORAGE_KEY = 'wache-direct-sale-pricing-catalog';

export const EMPTY_PRICING_CATALOG_OPTIONS = {
  brands: [],
  productNamesByBrand: {},
};

export function normalizePricingBrand(value) {
  return String(value || '').trim().toUpperCase();
}

export function formatPricingBrandLabel(value) {
  const key = normalizePricingBrand(value);
  const known = ADMIN_BRAND_OPTIONS.find((o) => o.value === key);
  if (known) return known.label;
  if (!key) return '';
  return key.charAt(0) + key.slice(1).toLowerCase();
}

export function loadPricingCatalogOptions() {
  if (typeof window === 'undefined') return { ...EMPTY_PRICING_CATALOG_OPTIONS };
  try {
    const raw = JSON.parse(localStorage.getItem(PRICING_CATALOG_OPTIONS_STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...EMPTY_PRICING_CATALOG_OPTIONS };
    return {
      brands: Array.isArray(raw.brands)
        ? [...new Set(raw.brands.map(normalizePricingBrand).filter(Boolean))]
        : [],
      productNamesByBrand:
        raw.productNamesByBrand && typeof raw.productNamesByBrand === 'object'
          ? raw.productNamesByBrand
          : {},
    };
  } catch {
    return { ...EMPTY_PRICING_CATALOG_OPTIONS };
  }
}

export function savePricingCatalogOptions(next) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PRICING_CATALOG_OPTIONS_STORAGE_KEY, JSON.stringify(next));
}

export function buildPricingBrandOptions({ customOptions, pricingRows, currentBrand }) {
  const map = new Map();
  for (const { value, label } of ADMIN_BRAND_OPTIONS) {
    map.set(value, label);
  }
  for (const b of customOptions?.brands || []) {
    const key = normalizePricingBrand(b);
    if (key && !map.has(key)) map.set(key, formatPricingBrandLabel(key));
  }
  for (const row of pricingRows || []) {
    const key = normalizePricingBrand(row?.brand);
    if (key && !map.has(key)) map.set(key, formatPricingBrandLabel(key));
  }
  const current = normalizePricingBrand(currentBrand);
  if (current && !map.has(current)) map.set(current, formatPricingBrandLabel(current));

  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
}

export function buildPricingProductNameOptions({
  brand,
  customOptions,
  pricingRows,
  currentProductName,
}) {
  const brandKey = normalizePricingBrand(brand);
  if (!brandKey) return [];

  const names = new Set();
  for (const name of ADMIN_PHONES_BY_BRAND[brandKey] || []) {
    if (String(name || '').trim()) names.add(String(name).trim());
  }
  const customList = customOptions?.productNamesByBrand?.[brandKey];
  if (Array.isArray(customList)) {
    for (const name of customList) {
      if (String(name || '').trim()) names.add(String(name).trim());
    }
  }
  for (const row of pricingRows || []) {
    if (normalizePricingBrand(row?.brand) !== brandKey) continue;
    const n = String(row?.productName || '').trim();
    if (n) names.add(n);
  }
  const current = String(currentProductName || '').trim();
  if (current) names.add(current);

  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function appendCustomBrand(customOptions, brandRaw) {
  const brand = normalizePricingBrand(brandRaw);
  if (!brand) return customOptions;
  const brands = customOptions.brands.includes(brand)
    ? customOptions.brands
    : [...customOptions.brands, brand];
  return { ...customOptions, brands };
}

export function appendCustomProductName(customOptions, brandRaw, nameRaw) {
  const brand = normalizePricingBrand(brandRaw);
  const name = String(nameRaw || '').trim();
  if (!brand || !name) return customOptions;
  const prev = customOptions.productNamesByBrand?.[brand] || [];
  const nextList = prev.includes(name) ? prev : [...prev, name];
  return {
    ...customOptions,
    productNamesByBrand: {
      ...customOptions.productNamesByBrand,
      [brand]: nextList,
    },
  };
}
