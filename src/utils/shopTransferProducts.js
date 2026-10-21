import { normalizedImeList, inventoryRowImeCodes } from './productIme';
import { mergeInventoryProducts } from './mergeInventoryProducts';
import { primaryProductImageUrl } from './productCatalogImage';
import { isProductTravelling } from './productTravelRoute';

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

function capacitySort(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
  const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/** On-hand shop inventory: arrived at the shop (not travelling) with stock. */
export function filterShopTransferInventory(products = []) {
  return (products || []).filter((p) => {
    if (isProductTravelling(p)) return false;
    const status = String(p?.shipmentStatus || 'arrived').toLowerCase();
    if (status !== 'arrived') return false;
    return Math.max(0, Number(p?.stock) || 0) > 0;
  });
}

/** Unique product names from arrived stock lines. */
export function shopTransferProductNames(products = []) {
  const names = new Set();
  for (const p of products) {
    const name = String(p?.product_name || '').trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Storage options for a selected product name (or all products when name is blank). */
export function shopTransferCapacityOptions(products = [], productName = '') {
  const target = norm(productName);
  const caps = new Set();
  for (const p of products) {
    if (target && norm(p?.product_name) !== target) continue;
    const cap = String(p?.capacity || '').trim();
    if (cap) caps.add(cap);
  }
  return [...caps].sort(capacitySort);
}

/** Filter arrived products for the transfer picker table. */
export function shopTransferTableProducts(products = [], productName = '', capacity = '') {
  const target = norm(productName);
  const cap = String(capacity || '').trim();

  return products.filter((p) => {
    if (target && norm(p?.product_name) !== target) return false;
    if (cap && norm(p?.capacity) !== norm(cap)) return false;
    return Math.max(0, Number(p?.stock) || 0) > 0;
  });
}

/**
 * Expand product lines into one table row per unit / IME.
 */
export function shopTransferUnitRows(products = [], productName = '', capacity = '') {
  const lines = shopTransferTableProducts(products, productName, capacity);
  const rows = [];

  for (const product of lines) {
    const productId = String(product?._id ?? product?.id ?? '').trim();
    if (!productId) continue;

    const imes = normalizedImeList(product);
    const stock = Math.max(0, Number(product?.stock) || 0);
    const base = {
      productId,
      product,
      product_name: String(product?.product_name || '').trim(),
      brand: String(product?.brand || '').trim(),
      capacity: String(product?.capacity || '').trim(),
      color: String(product?.color || '').trim(),
    };

    if (imes.length > 0) {
      for (const ime of imes) {
        rows.push({
          ...base,
          rowKey: `${productId}|${ime}`,
          ime,
        });
      }
      for (let i = imes.length; i < stock; i += 1) {
        rows.push({
          ...base,
          rowKey: `${productId}|unit-${i}`,
          ime: '',
        });
      }
      continue;
    }

    const unitCount = Math.max(1, stock);
    for (let i = 0; i < unitCount; i += 1) {
      rows.push({
        ...base,
        rowKey: `${productId}|unit-${i}`,
        ime: '',
      });
    }
  }

  return rows;
}

/** First catalog image among matching products. */
export function shopTransferProductImage(products = [], productName = '') {
  const target = norm(productName);
  if (!target) return '';
  for (const p of products) {
    if (norm(p?.product_name) !== target) {
      continue;
    }
    const url = primaryProductImageUrl(p);
    if (url) return url;
  }
  return '';
}

export function shopTransferBatchEntry(unitRow) {
  if (!unitRow?.rowKey || !unitRow?.productId) return null;
  return {
    rowKey: unitRow.rowKey,
    productId: unitRow.productId,
    product_name: unitRow.product_name || '',
    brand: unitRow.brand || '',
    capacity: unitRow.capacity || '',
    color: unitRow.color || '',
    ime: String(unitRow.ime || '').trim(),
  };
}

export function shopTransferBatchKey(row) {
  return String(row?.rowKey || row?.productId || '').trim();
}

/** Row count shown in the admin shop inventory table (on-hand lines merged by product, with IME). */
export function countShopInventoryTableRows(products = []) {
  const onHand = filterShopTransferInventory(products);
  const merged = mergeInventoryProducts(onHand);
  return merged.filter((row) => inventoryRowImeCodes(row).length > 0).length;
}
