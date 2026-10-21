import { findPricingCatalogMatch, productPricingCatalogKey } from './pricingCatalogMatch';

export function buildPricingCatalogLookup(catalogRows = []) {
  const map = new Map();
  for (const entry of catalogRows) {
    const key = productPricingCatalogKey({
      product_name: entry?.productName,
      brand: entry?.brand,
      capacity: entry?.capacity,
    });
    if (!key.replace(/\|/g, '').length) continue;
    map.set(key, {
      retailPrice: entry?.retailPrice,
      wholesalePrice: entry?.wholesalePrice,
    });
  }
  return map;
}

export function resolveInventoryPricing(product, lookup) {
  const catalog = lookup?.get(productPricingCatalogKey(product)) || null;
  const inventoryWholesale = Number(product?.price);
  const inventoryRetail = Number(product?.priceMax);
  const wholesale =
    catalog?.wholesalePrice > 0
      ? catalog.wholesalePrice
      : Number.isFinite(inventoryWholesale) && inventoryWholesale > 0
        ? inventoryWholesale
        : null;
  const retail =
    catalog?.retailPrice > 0
      ? catalog.retailPrice
      : Number.isFinite(inventoryRetail) && inventoryRetail > 0
        ? inventoryRetail
        : null;
  return { retail, wholesale };
}

function hasUploadNameBrand(fields) {
  return Boolean(
    String(fields?.product_name ?? fields?.productName ?? '').trim() &&
      String(fields?.brand ?? '').trim(),
  );
}

function pricesFromPricingRow(row) {
  if (!row) return null;
  const wholesalePrice = Number(row?.wholesalePrice);
  const retailPrice = Number(row?.retailPrice);
  if (!(wholesalePrice > 0) && !(retailPrice > 0)) return null;
  return {
    wholesalePrice: wholesalePrice > 0 ? wholesalePrice : null,
    retailPrice: retailPrice > 0 ? retailPrice : null,
  };
}

/**
 * Look up Direct Sales pricing for an upload row.
 * Exact match on name + brand + capacity when possible; otherwise name + brand.
 */
export function catalogPricesForUploadForm(fields, lookup, catalogRows = []) {
  if (!hasUploadNameBrand(fields)) return null;

  const capacity = String(fields?.capacity ?? '').trim();
  if (capacity) {
    const fromMap = lookup?.get(productPricingCatalogKey(fields));
    if (fromMap && (fromMap.wholesalePrice > 0 || fromMap.retailPrice > 0)) {
      return fromMap;
    }
  }

  const match = findPricingCatalogMatch(fields, catalogRows, { requireCapacity: false });
  return pricesFromPricingRow(match);
}

/** Fill wholesale/retail on bulk upload rows from the pricing catalog when a match exists. */
export function applyCatalogPricesToBulkRow(row, lookup, { force = true, catalogRows = [] } = {}) {
  const next = applyCatalogPricesToUploadForm(
    {
      product_name: row?.product_name,
      brand: row?.brand,
      capacity: row?.capacity,
      wholesalePrice: row?.wholesalePrice ?? row?.price ?? '',
      retailPrice: row?.retailPrice ?? '',
    },
    lookup,
    { force, catalogRows },
  );
  const wholesale = next.wholesalePrice ?? row.wholesalePrice ?? row.price ?? '';
  const retail = next.retailPrice ?? row.retailPrice ?? '';
  if (
    wholesale === (row.wholesalePrice ?? row.price ?? '') &&
    retail === (row.retailPrice ?? '')
  ) {
    return row;
  }
  return {
    ...row,
    wholesalePrice: wholesale,
    retailPrice: retail,
    price: wholesale,
  };
}

/**
 * Fill wholesale/retail on upload forms from the pricing catalog when a match exists.
 * Overwrites when `force` is true (default) so identity changes refresh catalog prices.
 */
export function applyCatalogPricesToUploadForm(prev, lookup, { force = true, catalogRows = [] } = {}) {
  const entry = catalogPricesForUploadForm(prev, lookup, catalogRows);
  if (!entry) return prev;

  const wholesaleVal =
    entry.wholesalePrice != null && Number(entry.wholesalePrice) > 0
      ? String(entry.wholesalePrice)
      : '';
  const retailVal =
    entry.retailPrice != null && Number(entry.retailPrice) > 0 ? String(entry.retailPrice) : '';

  if (!wholesaleVal && !retailVal) return prev;

  const next = { ...prev };
  if (wholesaleVal && (force || !String(prev.wholesalePrice ?? '').trim())) {
    next.wholesalePrice = wholesaleVal;
  }
  if (retailVal && (force || !String(prev.retailPrice ?? '').trim())) {
    next.retailPrice = retailVal;
  }

  if (
    next.wholesalePrice === prev.wholesalePrice &&
    next.retailPrice === prev.retailPrice
  ) {
    return prev;
  }
  return next;
}
