/** Fallback lists when the catalog has no brands / types yet (merged with live catalog in the UI). */
export const PREORDER_BRAND_FALLBACK = [
  'Apple',
  'Samsung',
  'Tecno',
  'Infinix',
  'Itel',
  'Xiaomi',
  'Huawei',
  'Oppo',
  'Vivo',
  'Realme',
  'Nokia',
  'Sony',
  'Google',
  'Motorola',
  'OnePlus',
];

export const PREORDER_CATEGORY_FALLBACK = [
  'Smartphone',
  'Tablet',
  'Feature phone',
  'Laptop',
  'Desktop / PC',
  'Monitor',
  'Smartwatch',
  'Earbuds / headphones',
  'Charger / cable',
  'Power bank',
  'Router / networking',
  'Accessory (other)',
];

/** Select value that opens the custom text field */
export const PREORDER_SELECT_OTHER = '__other__';

export function isPreorderSelectOther(value) {
  return String(value || '') === PREORDER_SELECT_OTHER;
}

export function mergePreorderSelectOptions(catalogValues = [], fallbacks = []) {
  const set = new Set();
  [...fallbacks, ...catalogValues].forEach((v) => {
    const s = String(v || '').trim();
    if (s) set.add(s);
  });
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
