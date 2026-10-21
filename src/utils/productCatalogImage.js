import {
  findBestPricingCatalogImageMatchForEnrichment,
  findInventoryProductsForPricingRow,
  findPricingCatalogImageMatch,
  findPricingCatalogMatch,
  productPricingCatalogKey,
} from './pricingCatalogMatch';
import { mergeCatalogProducts, vendorListingKey } from './mergeCatalogProducts';
import { productLineUnitCount, resolveEffectiveLineStock } from './productIme';

/** Collect image URLs — pricing-table photo first when matched, then inventory uploads. */
export function collectProductImageUrls(product, pricingCatalog = null) {
  const urls = [];
  const seen = new Set();

  const add = (url) => {
    const t = String(url || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    urls.push(t);
  };

  const catalogUrl = resolvePricingCatalogImageUrl(product, pricingCatalog);
  if (catalogUrl) add(catalogUrl);

  if (Array.isArray(product?.catalogImages)) {
    product.catalogImages.forEach((img) => add(img?.url || img));
  }

  const pricingMatch = findPricingCatalogImageMatch(product, pricingCatalog);
  if (Array.isArray(pricingMatch?.images)) {
    pricingMatch.images.forEach((img) => add(img?.url || img));
  }

  if (product?.primaryImage?.url) add(product.primaryImage.url);
  if (Array.isArray(product?.images)) {
    product.images.forEach((img) => add(img?.url || img));
  }

  return urls;
}

/** Image URL from pricing catalog match (name + capacity) or server-provided catalogImageUrl. */
export function resolvePricingCatalogImageUrl(product, pricingCatalog = null) {
  const fromApi = String(product?.catalogImageUrl || '').trim();
  if (fromApi) return fromApi;

  if (!Array.isArray(pricingCatalog) || pricingCatalog.length === 0) return '';
  const match = findPricingCatalogImageMatch(product, pricingCatalog);
  return String(match?.imageUrl || '').trim();
}

function productHasOwnImages(product) {
  if (product?.primaryImage?.url && String(product.primaryImage.url).trim()) return true;
  const images = Array.isArray(product?.images) ? product.images : [];
  return images.some((img) => String(img?.url || img || '').trim());
}

function resolveListingPrice(product, pricingCatalog = null, pricingMatch = null) {
  const match = pricingMatch || findPricingCatalogImageMatch(product, pricingCatalog);
  const inventoryPrice = Number(product?.price);
  const wholesale = Number(match?.wholesalePrice);
  const retail = Number(match?.retailPrice);
  if (Number.isFinite(inventoryPrice) && inventoryPrice > 0) return inventoryPrice;
  if (Number.isFinite(wholesale) && wholesale > 0) return wholesale;
  if (Number.isFinite(retail) && retail > 0) return retail;
  return 0;
}

/** Vendor shop price — inventory vendor price or pricing wholesale only (never retail). */
export function resolveVendorListingPrice(product, pricingRow = null) {
  const inventoryVendor = Number(product?.price);
  if (Number.isFinite(inventoryVendor) && inventoryVendor > 0) return inventoryVendor;

  const wholesale = Number(pricingRow?.wholesalePrice);
  if (Number.isFinite(wholesale) && wholesale > 0) return wholesale;

  return 0;
}

function applyPricingRowToProduct(product, pricingRow) {
  const rowImages = Array.isArray(pricingRow?.images)
    ? pricingRow.images.map((img) => String(img?.url || '').trim()).filter(Boolean)
    : [];
  const imageUrl = rowImages[0] || String(pricingRow?.imageUrl || product?.catalogImageUrl || '').trim();
  if (!imageUrl) return product;

  const next = { ...product, catalogImageUrl: imageUrl };
  const publicId = String(pricingRow?.imagePublicId || product?.catalogImagePublicId || '').trim();
  if (publicId) next.catalogImagePublicId = publicId;
  const alt = String(
    pricingRow?.imageAlt || product?.catalogImageAlt || product?.product_name || pricingRow?.productName || '',
  ).trim();
  if (alt) next.catalogImageAlt = alt;
  if (rowImages.length > 1 || (Array.isArray(pricingRow?.images) && pricingRow.images.length > 1)) {
    next.catalogImages = (Array.isArray(pricingRow?.images) ? pricingRow.images : [])
      .filter((img) => String(img?.url || '').trim())
      .map((img) => ({
        url: String(img.url).trim(),
        publicId: String(img.publicId || '').trim(),
        alt: String(img.alt || alt || '').trim(),
      }));
  }

  const listingPrice = resolveVendorListingPrice(product, pricingRow);
  if (listingPrice > 0) {
    next.price = listingPrice;
  }

  next.stock = resolveEffectiveLineStock(next);

  return next;
}

/** Vendor listing built only from a pricing row (no inventory match). */
export function buildVendorListingFromPricingRow(pricingRow, inventoryMatches = []) {
  if (!pricingRow || !pricingRowHasShopImage(pricingRow)) return null;

  const rowImages = Array.isArray(pricingRow?.images)
    ? pricingRow.images.map((img) => String(img?.url || '').trim()).filter(Boolean)
    : [];
  const imageUrl = rowImages[0] || String(pricingRow?.imageUrl || '').trim();
  if (!imageUrl) return null;

  const wholesale = Number(pricingRow?.wholesalePrice);
  if (!Number.isFinite(wholesale) || wholesale <= 0) return null;

  const catalogKey = productPricingCatalogKey({
    product_name: pricingRow?.productName ?? pricingRow?.product_name,
    brand: pricingRow?.brand,
    capacity: pricingRow?.capacity,
  });
  const stableId = `pricing:${catalogKey || pricingRow?._id || pricingRow?.id || imageUrl}`;

  const inventoryStock = (Array.isArray(inventoryMatches) ? inventoryMatches : []).reduce(
    (sum, row) => sum + productLineUnitCount(row),
    0,
  );

  const listing = {
    _id: stableId,
    id: stableId,
    product_name: pricingRow?.productName ?? pricingRow?.product_name ?? '',
    brand: pricingRow?.brand ?? '',
    capacity: pricingRow?.capacity ?? '',
    product_type: 'Smartphone',
    color: 'Standard',
    stock: inventoryStock,
    platformStock: inventoryStock,
    price: wholesale,
    catalogImageUrl: imageUrl,
    __pricingCatalogOnly: true,
  };

  const publicId = String(pricingRow?.imagePublicId || '').trim();
  if (publicId) listing.catalogImagePublicId = publicId;
  const alt = String(pricingRow?.imageAlt || listing.product_name || '').trim();
  if (alt) listing.catalogImageAlt = alt;
  if (rowImages.length > 1 || (Array.isArray(pricingRow?.images) && pricingRow.images.length > 1)) {
    listing.catalogImages = (Array.isArray(pricingRow?.images) ? pricingRow.images : [])
      .filter((img) => String(img?.url || '').trim())
      .map((img) => ({
        url: String(img.url).trim(),
        publicId: String(img.publicId || '').trim(),
        alt: String(img.alt || alt || '').trim(),
      }));
  }

  return listing;
}

/** Attach pricing-table photos and wholesale price to inventory rows (name + capacity match). */
export function enrichProductsWithPricingCatalogImages(products = [], pricingCatalog = null) {
  const list = Array.isArray(products) ? products : [];
  if (!list.length) return list;

  return list.map((product) => {
    if (!product || typeof product !== 'object') return product;
    const match = findBestPricingCatalogImageMatchForEnrichment(product, pricingCatalog);
    if (!match) return product;
    return applyPricingRowToProduct(product, match);
  });
}

export function productHasPricingCatalogImage(product, pricingCatalog = null) {
  return Boolean(resolvePricingCatalogImageUrl(product, pricingCatalog));
}

/** Vendor shop: only pricing-table uploads count — not warehouse/inventory photos. */
export function collectVendorShopImageUrls(product) {
  const urls = [];
  const seen = new Set();

  const add = (url) => {
    const t = String(url || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    urls.push(t);
  };

  add(product?.catalogImageUrl);

  if (Array.isArray(product?.catalogImages)) {
    product.catalogImages.forEach((img) => add(img?.url || img));
  }

  return urls;
}

export function productHasVendorShopCatalogImage(product) {
  return collectVendorShopImageUrls(product).length > 0;
}

export function productHasCatalogImage(product, pricingCatalog = null) {
  return productHasOwnImages(product) || productHasPricingCatalogImage(product, pricingCatalog);
}

function isUsaWarehouseProduct(product) {
  const wh = product?.currentWarehouse;
  if (wh && typeof wh === 'object') {
    return String(wh.city || '').trim().toUpperCase() === 'USA';
  }
  return false;
}

export function pricingRowHasShopImage(row) {
  if (Array.isArray(row?.images) && row.images.some((img) => String(img?.url || '').trim())) {
    return true;
  }
  return Boolean(String(row?.imageUrl || '').trim());
}

/** Direct Sales pricing rows with no catalog photo — shown under Inventory → Need Shop photos. */
export function filterPricingRowsMissingShopImages(pricingCatalog = []) {
  return (Array.isArray(pricingCatalog) ? pricingCatalog : []).filter(
    (row) => row && !pricingRowHasShopImage(row),
  );
}

export function countPricingRowsMissingShopImages(pricingCatalog = []) {
  return filterPricingRowsMissingShopImages(pricingCatalog).length;
}

export function primaryProductImageUrl(product, pricingCatalog = null) {
  return collectProductImageUrls(product, pricingCatalog)[0] || '';
}

/** First inventory product that matches a pricing row on product name + capacity. */
export function findInventoryProductForPricingRow(row, products = []) {
  const matches = findInventoryProductsForPricingRow(row, products);
  return matches[0] || null;
}

/** Pricing table thumbnail: catalog upload first, then a matching inventory product photo. */
export function resolvePricingRowDisplayImage(row, inventoryProducts = []) {
  const catalogImages = Array.isArray(row?.images)
    ? row.images.map((img) => String(img?.url || '').trim()).filter(Boolean)
    : [];
  const pricingImage = catalogImages[0] || String(row?.imageUrl || '').trim();
  if (pricingImage) return pricingImage;

  const product = findInventoryProductForPricingRow(row, inventoryProducts);
  if (!product) return '';
  return primaryProductImageUrl(product);
}

function isVendorEligibleInventoryProduct(product, pricingRow = null) {
  if (!product) return false;
  if (String(product?.shipmentStatus || '').toLowerCase() === 'travelling') return false;
  if (isUsaWarehouseProduct(product)) return false;
  const priced = resolveVendorListingPrice(product, pricingRow);
  if (priced <= 0) return false;
  if (pricingRow) return pricingRowHasShopImage(pricingRow);
  return productHasPricingCatalogImage(product);
}

/**
 * Pricing-first vendor catalog:
 * 1) each pricing row with an image
 * 2) find inventory with the same product name + brand + capacity
 * 3) list on the vendor shop with that pricing photo
 */
export function buildWholesaleShopCatalog(products = [], pricingCatalog = null, userCity = '') {
  const inventory = Array.isArray(products) ? products : [];
  const pricingRows = (Array.isArray(pricingCatalog) ? pricingCatalog : []).filter(pricingRowHasShopImage);
  const listed = [];
  const seenIds = new Set();

  for (const pricingRow of pricingRows) {
    const matches = findInventoryProductsForPricingRow(pricingRow, inventory);
    let addedForRow = false;

    for (const product of matches) {
      const enriched = applyPricingRowToProduct(product, pricingRow);
      if (!productHasVendorShopCatalogImage(enriched)) continue;
      if (!isVendorEligibleInventoryProduct(enriched, pricingRow)) continue;

      const id = String(enriched._id ?? enriched.id ?? '');
      if (id && seenIds.has(id)) continue;
      if (id) seenIds.add(id);
      listed.push(enriched);
      addedForRow = true;
    }

    if (!addedForRow) {
      const fallback = buildVendorListingFromPricingRow(pricingRow, matches);
      if (!fallback) continue;
      const key = vendorListingKey(fallback);
      const alreadyListed = listed.some((row) => vendorListingKey(row) === key);
      if (!alreadyListed) listed.push(fallback);
    }
  }

  return mergeCatalogProducts(listed, userCity);
}

/** @deprecated Use isVendorEligibleInventoryProduct via buildWholesaleShopCatalog. */
export function productIsShopListed(product, pricingCatalog = null) {
  if (!product) return false;
  if (!productHasPricingCatalogImage(product, pricingCatalog)) return false;
  return isVendorEligibleInventoryProduct(product, findPricingCatalogImageMatch(product, pricingCatalog));
}
