import { warehouseId } from '../api/warehouseApi';

export function productVariantKey(p) {
  return [
    String(p?.product_name || p?.productName || '').trim().toLowerCase(),
    String(p?.brand || '').trim().toLowerCase(),
    String(p?.capacity || '').trim().toLowerCase(),
    String(p?.color || '').trim().toLowerCase(),
  ].join('|');
}

function warehouseRefId(w) {
  if (!w) return '';
  if (typeof w === 'object') return warehouseId(w);
  return String(w).trim();
}

function warehouseRefName(w) {
  if (!w) return '';
  if (typeof w === 'object') return String(w.name || '').trim();
  return '';
}

function isSellableAtShop(p) {
  const stock = Math.max(0, Number(p?.stock) || 0);
  if (stock <= 0) return false;
  const status = String(p?.shipmentStatus || '').toLowerCase();
  return status !== 'travelling';
}

function pickPriceMin(current, next) {
  const a = Number(current);
  const b = Number(next);
  if (!Number.isFinite(b) || b <= 0) return current;
  if (!Number.isFinite(a) || a <= 0) return b;
  return Math.min(a, b);
}

function pickPriceMax(current, next) {
  const a = Number(current);
  const b = Number(next);
  if (!Number.isFinite(b) || b <= 0) return current;
  if (!Number.isFinite(a) || a <= 0) return b;
  return Math.max(a, b);
}

function pickPrice(current, next) {
  const b = Number(next);
  if (!Number.isFinite(b) || b <= 0) return current;
  return current == null || current <= 0 ? b : current;
}

/**
 * Build deduplicated pricing rows from full catalog + optional shop stock.
 */
export function buildPricingCatalogRows(allProducts, shopProducts, currentShopId) {
  const shopId = String(currentShopId || '').trim();
  const shopStockByKey = new Map();

  for (const p of shopProducts || []) {
    if (!isSellableAtShop(p)) continue;
    const whId = warehouseRefId(p?.currentWarehouse);
    if (shopId && whId && whId !== shopId) continue;
    const key = productVariantKey(p);
    const stock = Math.max(0, Number(p?.stock) || 0);
    shopStockByKey.set(key, (shopStockByKey.get(key) || 0) + stock);
  }

  const byKey = new Map();

  for (const p of allProducts || []) {
    const key = productVariantKey(p);
    if (!key.replace(/\|/g, '').length) continue;

    let row = byKey.get(key);
    if (!row) {
      row = {
        key,
        productName: String(p?.product_name || p?.productName || 'Product').trim(),
        brand: String(p?.brand || '').trim(),
        capacity: String(p?.capacity || '').trim(),
        color: String(p?.color || '').trim(),
        price: null,
        priceMin: null,
        priceMax: null,
        shopStock: 0,
        elsewhereStock: 0,
        sourceWarehouses: [],
        sampleProduct: p,
      };
      byKey.set(key, row);
    }

    row.price = pickPrice(row.price, p?.price);
    row.priceMin = pickPriceMin(row.priceMin, p?.priceMin);
    row.priceMax = pickPriceMax(row.priceMax, p?.priceMax);

    const stock = Math.max(0, Number(p?.stock) || 0);
    const whId = warehouseRefId(p?.currentWarehouse);
    const sellable = isSellableAtShop(p);

    if (shopId && whId === shopId && sellable) {
      row.shopStock += stock;
    } else if (sellable && stock > 0 && whId) {
      row.elsewhereStock += stock;
      const existing = row.sourceWarehouses.find((w) => w.id === whId);
      if (existing) {
        existing.stock += stock;
      } else {
        row.sourceWarehouses.push({
          id: whId,
          name: warehouseRefName(p?.currentWarehouse) || 'Warehouse',
          stock,
        });
      }
    }
  }

  for (const [key, stock] of shopStockByKey) {
    const row = byKey.get(key);
    if (row) {
      row.shopStock = Math.max(row.shopStock, stock);
    }
  }

  return Array.from(byKey.values())
    .map((row) => ({
      ...row,
      availableAtShop: row.shopStock > 0,
      canRequest: row.shopStock <= 0 && row.elsewhereStock > 0,
    }))
    .sort((a, b) =>
      a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base' }),
    );
}

export function filterPricingRows(rows, searchQuery) {
  const q = String(searchQuery || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [row.productName, row.brand, row.capacity, row.color]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function bestSourceWarehouse(row) {
  if (!row?.sourceWarehouses?.length) return null;
  return [...row.sourceWarehouses].sort((a, b) => b.stock - a.stock)[0];
}
