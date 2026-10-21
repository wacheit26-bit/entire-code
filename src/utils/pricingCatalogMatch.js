const LEADING_BRAND_PREFIXES = [
  'google',
  'samsung',
  'apple',
  'honor',
  'huawei',
  'xiaomi',
  'oneplus',
  'motorola',
  'nokia',
  'oppo',
  'vivo',
  'realme',
];

function stripLeadingBrandPrefix(normalizedCompactName) {
  let s = String(normalizedCompactName || '');
  for (const prefix of LEADING_BRAND_PREFIXES) {
    if (s.startsWith(prefix)) {
      s = s.slice(prefix.length);
      break;
    }
  }
  return s;
}

export function normProductNameForMatch(value) {
  const compact = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[®™©'’`"]/g, '')
    .replace(/\s+/g, '');
  return stripLeadingBrandPrefix(compact);
}

export function normPricingSpelling(value) {
  return normProductNameForMatch(value);
}

/** Normalize storage labels so "64 GB", "64GB", and "64" compare equal. */
export function normPricingCapacity(value) {
  const compact = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (!compact) return '';
  const exact = compact.match(/^(\d+)(tb|gb|mb)?$/);
  if (exact) return `${exact[1]}${exact[2] || 'gb'}`;
  const embedded = compact.match(/(\d+)(tb|gb|mb)/);
  if (embedded) return `${embedded[1]}${embedded[2]}`;
  const digitsOnly = compact.match(/^(\d+)$/);
  if (digitsOnly) return `${digitsOnly[1]}gb`;
  return compact;
}

export function pricingCapacitiesMatch(a, b) {
  const ca = normPricingCapacity(a);
  const cb = normPricingCapacity(b);
  if (ca && cb) return ca === cb;
  return normPricingSpelling(a) === normPricingSpelling(b);
}

export function productPricingCatalogKey(product) {
  const productName = normPricingSpelling(product?.product_name ?? product?.productName);
  const brand = normPricingSpelling(product?.brand);
  const capacity = normPricingCapacity(product?.capacity);
  return [productName, brand, capacity].join('|');
}

/** Name + brand only — used to match catalog rows despite storage/capacity differences. */
export function productPricingNameBrandKey(product) {
  const productName = normPricingSpelling(product?.product_name ?? product?.productName);
  const brand = normPricingSpelling(product?.brand);
  return [productName, brand].join('|');
}

export function buildPricingCatalogKeySet(rows = []) {
  const set = new Set();
  for (const row of rows) {
    const key = productPricingCatalogKey({
      product_name: row?.productName,
      brand: row?.brand,
      capacity: row?.capacity,
    });
    if (key.replace(/\|/g, '').length) set.add(key);
  }
  return set;
}

export function buildPricingCatalogNameBrandSet(rows = []) {
  const set = new Set();
  for (const row of rows) {
    const key = productPricingNameBrandKey({
      product_name: row?.productName,
      brand: row?.brand,
    });
    if (key.replace(/\|/g, '').length) set.add(key);
  }
  return set;
}

export function productHasPricingCatalogMatch(product, catalogKeys, catalogNameBrandKeys) {
  const exactKey = productPricingCatalogKey(product);
  if (!exactKey.replace(/\|/g, '').length) return false;
  if (catalogKeys?.has(exactKey)) return true;
  const nameBrandKey = productPricingNameBrandKey(product);
  if (!nameBrandKey.replace(/\|/g, '').length) return false;
  return Boolean(catalogNameBrandKeys?.has(nameBrandKey));
}

export function productMissingPricingCatalog(product, catalogKeys, catalogNameBrandKeys) {
  const key = productPricingCatalogKey(product);
  if (!key.replace(/\|/g, '').length) return false;
  if (!catalogKeys || catalogKeys.size === 0) return true;
  return !productHasPricingCatalogMatch(product, catalogKeys, catalogNameBrandKeys);
}

export function countProductsMissingPricingCatalog(products = [], catalogRows = []) {
  const keys = buildPricingCatalogKeySet(catalogRows);
  const nameBrandKeys = buildPricingCatalogNameBrandSet(catalogRows);
  const list = Array.isArray(products) ? products : [];
  return list.filter((p) => productMissingPricingCatalog(p, keys, nameBrandKeys)).length;
}

export function filterProductsMissingPricingCatalog(products = [], catalogRows = []) {
  const keys = buildPricingCatalogKeySet(catalogRows);
  const nameBrandKeys = buildPricingCatalogNameBrandSet(catalogRows);
  const list = Array.isArray(products) ? products : [];
  return list.filter((p) => productMissingPricingCatalog(p, keys, nameBrandKeys));
}

function pricingRowHasImage(row) {
  if (Array.isArray(row?.images) && row.images.some((img) => String(img?.url || '').trim())) {
    return true;
  }
  return Boolean(String(row?.imageUrl || '').trim());
}

function pricingRowCatalogKey(row) {
  return productPricingCatalogKey({
    product_name: row?.productName ?? row?.product_name,
    brand: row?.brand,
    capacity: row?.capacity,
  });
}

function pricingRowNameBrandKey(row) {
  return productPricingNameBrandKey({
    product_name: row?.productName ?? row?.product_name,
    brand: row?.brand,
  });
}

/** Product name + capacity — wholesale listing matches pricing photos on these two fields. */
export function productPricingNameCapacityKey(product) {
  const productName = normProductNameForMatch(product?.product_name ?? product?.productName);
  const capacity = normPricingCapacity(product?.capacity);
  if (!productName || !capacity) return '';
  return `${productName}|${capacity}`;
}

function normBrand(value) {
  return String(value ?? '').trim().toLowerCase();
}

function inventoryMatchesPricingEntryStrict(product, pricingRow) {
  if (!product || !pricingRow || !pricingRowHasImage(pricingRow)) return false;

  const left = productPricingNameCapacityKey(product);
  const right = productPricingNameCapacityKey({
    product_name: pricingRow?.productName ?? pricingRow?.product_name,
    capacity: pricingRow?.capacity,
  });
  if (left && right && left === right) return true;

  const exactKey = productPricingCatalogKey(product);
  const rowKey = pricingRowCatalogKey(pricingRow);
  return Boolean(exactKey && rowKey && exactKey === rowKey);
}

function normBrandCompact(value) {
  return normBrand(value).replace(/\s+/g, '');
}

/** Vendor shop listing match — strict first, then same normalized model + brand + capacity. */
export function inventoryMatchesPricingRowForVendorShop(product, pricingRow) {
  if (!product || !pricingRow || !pricingRowHasImage(pricingRow)) return false;
  if (inventoryMatchesPricingEntryStrict(product, pricingRow)) return true;

  const model = normProductNameForMatch(product?.product_name ?? product?.productName);
  const rowModel = normProductNameForMatch(pricingRow?.productName ?? pricingRow?.product_name);
  const brand = normBrandCompact(product?.brand);
  const rowBrand = normBrandCompact(pricingRow?.brand);
  if (!model || !rowModel || model !== rowModel) return false;
  if (!brand || !rowBrand || brand !== rowBrand) return false;
  return pricingCapacitiesMatch(product?.capacity, pricingRow?.capacity);
}

/** Strict pricing photo match for vendor shop listing (name + capacity / catalog key only). */
export function findPricingCatalogImageMatch(product, catalogRows = []) {
  const list = (Array.isArray(catalogRows) ? catalogRows : []).filter(pricingRowHasImage);
  if (!list.length) return null;
  return list.find((row) => inventoryMatchesPricingRowForVendorShop(product, row)) || null;
}

/** Looser match for admin inventory enrichment — may reuse same-model pricing photo. */
export function findBestPricingCatalogImageMatchForEnrichment(product, catalogRows = []) {
  const list = (Array.isArray(catalogRows) ? catalogRows : []).filter(pricingRowHasImage);
  if (!list.length) return null;

  const strict = list.find((row) => inventoryMatchesPricingEntryStrict(product, row));
  if (strict) return strict;

  const model = normProductNameForMatch(product?.product_name ?? product?.productName);
  const brand = normBrand(product?.brand);
  if (!model || !brand) return null;

  const byModelCapacity = list.find(
    (row) =>
      normProductNameForMatch(row?.productName ?? row?.product_name) === model
      && normBrand(row?.brand) === brand
      && pricingCapacitiesMatch(product?.capacity, row?.capacity),
  );
  if (byModelCapacity) return byModelCapacity;

  return (
    list.find(
      (row) =>
        normProductNameForMatch(row?.productName ?? row?.product_name) === model
        && normBrand(row?.brand) === brand,
    ) || null
  );
}

/** @deprecated Vendor shop uses strict matching via findPricingCatalogImageMatch. */
export function findBestPricingCatalogImageMatch(product, catalogRows = []) {
  return findBestPricingCatalogImageMatchForEnrichment(product, catalogRows);
}

function inventoryMatchesPricingEntry(product, pricingRow) {
  return inventoryMatchesPricingEntryStrict(product, pricingRow);
}

/** Find inventory rows that match one pricing row for the vendor shop. */
export function findInventoryProductsForPricingRow(pricingRow, products = []) {
  const list = Array.isArray(products) ? products : [];
  return list.filter((product) => inventoryMatchesPricingRowForVendorShop(product, pricingRow));
}

export function findPricingCatalogMatch(product, catalogRows = [], options = {}) {
  const { requireCapacity = false } = options;
  const list = Array.isArray(catalogRows) ? catalogRows : [];
  const capacity = String(product?.capacity || '').trim();
  const exactKey = productPricingCatalogKey(product);
  const nameBrandKey = productPricingNameBrandKey(product);

  const exact = list.find((row) => pricingRowCatalogKey(row) === exactKey);
  if (exact) return exact;

  if (capacity) {
    const byCapacity = list.find(
      (row) =>
        pricingRowNameBrandKey(row) === nameBrandKey &&
        pricingCapacitiesMatch(row?.capacity, capacity),
    );
    if (byCapacity) return byCapacity;
  }

  if (requireCapacity && capacity) return null;

  return list.find((row) => pricingRowNameBrandKey(row) === nameBrandKey) || null;
}
