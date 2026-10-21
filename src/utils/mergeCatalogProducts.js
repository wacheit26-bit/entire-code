import { coerceBusinessLocation } from '../data/businessLocations';
import { normProductNameForMatch, normPricingCapacity } from './pricingCatalogMatch';
import { resolveEffectiveLineStock } from './productIme';

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

function normColorValue(color) {
  return String(color || 'standard').trim().toLowerCase();
}

/** Stable identity for the same SKU across warehouse + shop documents. */
export function catalogProductKey(product) {
  return [
    norm(product?.product_name),
    norm(product?.brand),
    norm(product?.capacity),
    norm(product?.color),
    norm(product?.product_type),
  ].join('|');
}

function productId(product) {
  return String(product?._id ?? product?.id ?? '').trim();
}

function locationCity(product) {
  const wh = product?.currentWarehouse;
  if (wh && typeof wh === 'object' && wh.city) return String(wh.city).trim();
  return String(product?.phoneLocation || 'Other').trim() || 'Other';
}

function locationKind(product) {
  const wh = product?.currentWarehouse;
  if (wh && typeof wh === 'object') {
    return String(wh.type || '').toLowerCase() === 'main' ? 'warehouse' : 'shop';
  }
  return 'shop';
}

function locationLabel(product) {
  const wh = product?.currentWarehouse;
  const city = locationCity(product);
  if (wh && typeof wh === 'object' && wh.name) {
    const kind = locationKind(product) === 'warehouse' ? 'Warehouse' : 'Shop';
    return `${wh.name} (${kind}) · ${city}`;
  }
  return city;
}

function imageScore(product) {
  const imgs = Array.isArray(product?.images) ? product.images.length : 0;
  const primary = product?.primaryImage?.url ? 1 : 0;
  const catalog = String(product?.catalogImageUrl || '').trim() ? 2 : 0;
  return imgs + primary + catalog;
}

function pickCatalogImageFromRows(rows = []) {
  for (const row of rows) {
    const url = String(row?.catalogImageUrl || '').trim();
    if (url) return url;
  }
  return '';
}

function pickCatalogImageMetaFromRows(rows = [], primary = null) {
  const catalogImageUrl = pickCatalogImageFromRows(rows) || String(primary?.catalogImageUrl || '').trim();
  if (!catalogImageUrl) return null;

  const source =
    rows.find((row) => String(row?.catalogImageUrl || '').trim() === catalogImageUrl) || primary;
  return {
    catalogImageUrl,
    catalogImagePublicId: String(source?.catalogImagePublicId || '').trim(),
    catalogImageAlt: String(source?.catalogImageAlt || '').trim(),
  };
}

function buildAvailabilityEntry(product) {
  const perLocation = resolveEffectiveLineStock(product);
  if (perLocation <= 0) return null;
  const id = productId(product);
  if (!id) return null;
  return {
    productId: id,
    city: locationCity(product),
    label: locationLabel(product),
    kind: locationKind(product),
    stock: perLocation,
  };
}

function resolveCatalogDisplayStock(rows, availability) {
  const platformValues = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row?.vendorPlatformStock ?? row?.platformStock))
    .filter((n) => Number.isFinite(n) && n >= 0);
  const lineTotals = (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + resolveEffectiveLineStock(row),
    0,
  );
  if (platformValues.length) {
    return Math.max(...platformValues, lineTotals, 0);
  }
  const availabilityTotal = availability.reduce((sum, row) => sum + row.stock, 0);
  return Math.max(availabilityTotal, lineTotals, 0);
}

/** Platform-wide stock totals keyed by vendor listing identity (name + brand + capacity). */
export function buildVendorPlatformStockMap(products = []) {
  const map = new Map();
  for (const product of products) {
    const key = vendorListingKey(product);
    if (!key.replace(/\|/g, '')) continue;
    map.set(key, (map.get(key) || 0) + resolveEffectiveLineStock(product));
  }
  return map;
}

function resolveVendorListingDisplayStock(rows, availability, listingKey, platformStockByKey = null) {
  const fromMap = platformStockByKey?.get(listingKey);
  if (Number.isFinite(fromMap) && fromMap >= 0) return fromMap;

  const vendorTotals = (Array.isArray(rows) ? rows : [])
    .map((row) => Number(row?.vendorPlatformStock))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (vendorTotals.length) {
    return Math.max(...vendorTotals, 0);
  }

  return resolveCatalogDisplayStock(rows, availability);
}

export function pickFulfillmentProductId(product, userCity = '') {
  if (product?.__fulfillmentProductId) return product.__fulfillmentProductId;
  const city = coerceBusinessLocation(userCity);
  const availability = Array.isArray(product?.availability) ? product.availability : [];
  if (city) {
    const local = availability.find((row) => row.city === city && row.stock > 0);
    if (local?.productId) return local.productId;
  }
  const first = availability.find((row) => row.stock > 0);
  return first?.productId || productId(product);
}

export function stockAtCity(product, userCity = '') {
  const city = coerceBusinessLocation(userCity);
  if (!city) return 0;
  const availability = Array.isArray(product?.availability) ? product.availability : [];
  return availability
    .filter((row) => row.city === city)
    .reduce((sum, row) => sum + Math.max(0, Number(row.stock) || 0), 0);
}

export function resolveProductForOrder(product, userCity = '') {
  const fulfillmentId = pickFulfillmentProductId(product, userCity);
  const localStock = stockAtCity(product, userCity);
  const totalStock = Math.max(0, Number(product?.stock) || 0);
  return {
    ...product,
    _id: fulfillmentId,
    id: fulfillmentId,
    __availableAtUserLocation: localStock,
    __requiresDelivery: totalStock > 0 && localStock === 0,
  };
}

/** Listing identity for vendor shop — same model + brand + capacity; colors merge into one card. */
export function vendorListingKey(product) {
  const name = normProductNameForMatch(product?.product_name ?? product?.productName);
  const brand = norm(product?.brand);
  const capacity = normPricingCapacity(product?.capacity);
  if (!name) {
    return [norm(product?.product_name), brand, norm(product?.capacity)].join('|');
  }
  return [name, brand, capacity].join('|');
}

function consolidateColorVariants(variants, userCity = '') {
  if (!Array.isArray(variants) || variants.length <= 1) return variants;

  const city = coerceBusinessLocation(userCity);
  const byColor = new Map();

  for (const variant of variants) {
    const colorKey = normColorValue(variant.color);
    const existing = byColor.get(colorKey);
    if (!existing) {
      byColor.set(colorKey, {
        ...variant,
        color: String(variant.color || '').trim() || 'Standard',
      });
      continue;
    }

    const mergedStock = existing.stock + variant.stock;
    const mergedAvailability = [
      ...(Array.isArray(existing.availability) ? existing.availability : []),
      ...(Array.isArray(variant.availability) ? variant.availability : []),
    ];

    const localStock = (rows) =>
      city
        ? rows
            .filter((row) => row.city === city)
            .reduce((sum, row) => sum + Math.max(0, Number(row.stock) || 0), 0)
        : 0;

    const preferVariant =
      (variant.stock > 0 && existing.stock <= 0)
      || (localStock(variant.availability || []) > localStock(existing.availability || []))
      || (variant.stock > existing.stock);

    const primary = preferVariant ? variant : existing;
    byColor.set(colorKey, {
      ...primary,
      color: String(primary.color || existing.color || variant.color || '').trim() || 'Standard',
      stock: mergedStock,
      availability: mergedAvailability,
    });
  }

  return [...byColor.values()].sort((a, b) => String(a.color).localeCompare(String(b.color)));
}

function buildVendorColorVariant(product, userCity = '') {
  const id = productId(product);
  const stock = resolveEffectiveLineStock(product);
  return {
    color: String(product?.color || '').trim() || 'Standard',
    productId: id,
    stock,
    price: Number(product?.price) || 0,
    product,
    availability: Array.isArray(product?.availability) ? product.availability : [],
    __fulfillmentProductId: pickFulfillmentProductId(product, userCity),
  };
}

/** Resolve a cart/order line to the selected color variant when applicable. */
export function resolveVendorListingProduct(listing, idOrVariantId) {
  if (!listing || typeof listing !== 'object') return listing;
  const variants = Array.isArray(listing.__colorVariants) ? listing.__colorVariants : [];
  if (!variants.length) return listing;

  const sid = String(idOrVariantId ?? listing._id ?? listing.id ?? '');
  const match =
    variants.find((v) => String(v.productId) === sid) ||
    variants.find((v) => v.color === idOrVariantId) ||
    variants.find((v) => v.stock > 0) ||
    variants[0];

  if (!match) return listing;

  return {
    ...listing,
    ...match.product,
    catalogImageUrl:
      String(match.product?.catalogImageUrl || listing?.catalogImageUrl || '').trim() || undefined,
    catalogImagePublicId:
      String(match.product?.catalogImagePublicId || listing?.catalogImagePublicId || '').trim() || undefined,
    catalogImageAlt:
      String(match.product?.catalogImageAlt || listing?.catalogImageAlt || '').trim() || undefined,
    catalogImages:
      (Array.isArray(match.product?.catalogImages) && match.product.catalogImages.length
        ? match.product.catalogImages
        : listing?.catalogImages) || undefined,
    color: match.color,
    stock: match.stock,
    price: match.price,
    _id: match.productId,
    id: match.productId,
    __fulfillmentProductId: match.__fulfillmentProductId,
    availability: match.availability,
  };
}

/** Find a vendor listing or color variant by product id. */
export function findVendorListingProduct(list, id) {
  const sid = String(id || '').trim();
  if (!sid) return null;
  const products = Array.isArray(list) ? list : [];

  for (const listing of products) {
    if (String(listing._id ?? listing.id) === sid) return listing;
    if (String(listing.__catalogKey) === sid) return listing;
    const variants = Array.isArray(listing.__colorVariants) ? listing.__colorVariants : [];
    const hit = variants.find((v) => String(v.productId) === sid);
    if (hit) return resolveVendorListingProduct(listing, hit.productId);
  }
  return null;
}

/**
 * Merge vendor listings so one card covers all colors of the same product name + brand + capacity.
 */
export function mergeVendorCatalogProducts(products, userCity = '', platformStockByKey = null) {
  const list = Array.isArray(products) ? products : [];
  const groups = new Map();

  list.forEach((raw) => {
    const key = vendorListingKey(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(raw);
  });

  const merged = [];

  groups.forEach((rows, key) => {
    const sorted = [...rows].sort((a, b) => {
      const stock = (Number(b.stock) || 0) - (Number(a.stock) || 0);
      if (stock !== 0) return stock;
      return String(a.color || '').localeCompare(String(b.color || ''));
    });

    const variants = consolidateColorVariants(
      sorted.map((row) => buildVendorColorVariant(row, userCity)),
      userCity,
    );
    const primary = sorted.find((row) => String(row._id ?? row.id) === String(variants[0]?.productId))
      || sorted[0];
    const variantAvailability = variants.flatMap((v) => (Array.isArray(v.availability) ? v.availability : []));
    const totalStock = resolveVendorListingDisplayStock(sorted, variantAvailability, key, platformStockByKey);
    const localStock = variants.reduce((sum, v) => {
      const city = coerceBusinessLocation(userCity);
      if (!city) return sum;
      const avail = Array.isArray(v.availability) ? v.availability : [];
      return (
        sum +
        avail.filter((row) => row.city === city).reduce((inner, row) => inner + Math.max(0, Number(row.stock) || 0), 0)
      );
    }, 0);

    const catalogMeta = pickCatalogImageMetaFromRows(sorted, primary);
    if (!catalogMeta?.catalogImageUrl) return;

    merged.push({
      ...primary,
      ...(catalogMeta || {}),
      price:
        variants.find((v) => v.stock > 0 && v.price > 0)?.price
        || variants.find((v) => v.price > 0)?.price
        || Number(primary.price) || 0,
      stock: totalStock,
      platformStock: totalStock,
      vendorPlatformStock: totalStock,
      __catalogKey: key,
      __colorVariants: variants,
      __hasColorChoice: variants.length > 1,
      availability: variants.flatMap((v) => v.availability),
      __fulfillmentProductId: pickFulfillmentProductId(
        { ...primary, availability: variants.flatMap((v) => v.availability), stock: totalStock },
        userCity,
      ),
      __availableAtUserLocation: localStock,
      __requiresDelivery: totalStock > 0 && userCity && localStock === 0,
    });
  });

  return merged;
}

/**
 * Merge duplicate catalog rows (same SKU at warehouse + shop) into one listing.
 */
export function mergeCatalogProducts(products, userCity = '') {
  const list = Array.isArray(products) ? products : [];
  const city = coerceBusinessLocation(userCity);
  const groups = new Map();

  list.forEach((raw) => {
    const key = catalogProductKey(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(raw);
  });

  const merged = [];

  groups.forEach((rows, key) => {
    if (rows.length === 1) {
      const single = rows[0];
      const availability = [buildAvailabilityEntry(single)].filter(Boolean);
      const totalStock = resolveCatalogDisplayStock(rows, availability);
      const localStock = availability
        .filter((row) => (city ? row.city === city : false))
        .reduce((sum, row) => sum + row.stock, 0);
      const catalogMeta = pickCatalogImageMetaFromRows([single], single);
      merged.push({
        ...single,
        ...(catalogMeta || {}),
        stock: totalStock,
        platformStock: single.platformStock ?? totalStock,
        __catalogKey: key,
        availability,
        __fulfillmentProductId: pickFulfillmentProductId({ ...single, availability }, city),
        __availableAtUserLocation: localStock,
        __requiresDelivery: totalStock > 0 && city && localStock === 0,
      });
      return;
    }

    const sorted = [...rows].sort((a, b) => {
      const img = imageScore(b) - imageScore(a);
      if (img !== 0) return img;
      const stock = (Number(b.stock) || 0) - (Number(a.stock) || 0);
      if (stock !== 0) return stock;
      return productTimestamp(b) - productTimestamp(a);
    });

    const primary = sorted[0];
    const availability = sorted.map(buildAvailabilityEntry).filter(Boolean);
    const totalStock = resolveCatalogDisplayStock(sorted, availability);
    const localStock = availability
      .filter((row) => (city ? row.city === city : false))
      .reduce((sum, row) => sum + row.stock, 0);

    const catalogMeta = pickCatalogImageMetaFromRows(sorted, primary);
    merged.push({
      ...primary,
      ...(catalogMeta || {}),
      stock: totalStock,
      platformStock: primary.platformStock ?? totalStock,
      __catalogKey: key,
      __mergedCount: rows.length,
      availability,
      __fulfillmentProductId: pickFulfillmentProductId({ availability, stock: totalStock, ...primary }, city),
      __availableAtUserLocation: localStock,
      __requiresDelivery: totalStock > 0 && city && localStock === 0,
    });
  });

  return merged;
}

function productTimestamp(p) {
  const raw = p?.createdAt || p?.updatedAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}
