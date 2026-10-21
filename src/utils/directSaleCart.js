import { resolveInventoryPricing } from './inventoryPricingDisplay';
import { findPricingCatalogMatch, pricingCapacitiesMatch } from './pricingCatalogMatch';

/** @typedef {{ rowId: string, ime: string, productName: string, brand: string, capacity: string, color: string, unitPrice: number }} UnitRow */
/** @typedef {{ id: string, productId: string, productName: string, brand: string, capacity: string, color: string, quantity: number, unitPrice: number, unitRows: UnitRow[] }} PurchaseLine */

export function newLineId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newUnitRowId() {
  return `unit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveProductWholesalePrice(product) {
  const candidates = [
    product?.wholesalePrice,
    product?.price,
    product?.priceMin,
    product?.priceMax,
  ]
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

export function productImeList(product) {
  if (!product) return [];
  const fromArray = Array.isArray(product.imeCodes)
    ? product.imeCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  const single = String(product.IME || '').trim();
  const merged = single ? [...fromArray, single] : fromArray;
  return [...new Set(merged)];
}

function productKey(product) {
  return String(product?._id ?? product?.id ?? '').trim();
}

/** All product-line ids covered by a sale row (every color variant of the chosen storage). */
export function saleRowVariantIds(row) {
  const set = new Set();
  for (const raw of Array.isArray(row?.variantIds) ? row.variantIds : []) {
    const id = String(raw || '').trim();
    if (id) set.add(id);
  }
  const primary = String(row?.productId || '').trim();
  if (primary) set.add(primary);
  return [...set];
}

/** Product docs for a sale row's storage pool (all colors of the selected capacity). */
export function saleRowVariantProducts(row, products = []) {
  const ids = new Set(saleRowVariantIds(row));
  if (!ids.size) return [];
  return (products || []).filter((p) => ids.has(productKey(p)));
}

/** Map of IME code -> owning product line, across a set of variants. */
export function imeOwnerMap(variantProducts = []) {
  const map = new Map();
  for (const p of variantProducts || []) {
    for (const ime of productImeList(p)) {
      if (!map.has(ime)) map.set(ime, p);
    }
  }
  return map;
}

/** Every registered IME across a sale row's storage pool, regardless of color. */
export function saleRowPoolImeList(row, products = []) {
  const pool = saleRowVariantProducts(row, products);
  return [...imeOwnerMap(pool).keys()];
}

/** Total stock across the row's storage pool. */
export function saleRowPoolStock(row, products = []) {
  return saleRowVariantProducts(row, products).reduce(
    (sum, p) => sum + Math.max(0, Number(p?.stock) || 0),
    0,
  );
}

/** Distinct colors of the row's selected IMEs, resolved from their owning product lines. */
export function saleRowSelectedImeColors(row, products = []) {
  const owners = imeOwnerMap(saleRowVariantProducts(row, products));
  const colors = new Set();
  for (const ime of normalizeSelectedImes(row)) {
    const c = String(owners.get(ime)?.color || '').trim();
    if (c) colors.add(c);
  }
  return [...colors].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function saleRowQuantityOrNull(row) {
  const raw = row?.quantity;
  if (raw === '' || raw == null) return null;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

export function saleRowQuantity(row) {
  return saleRowQuantityOrNull(row) ?? 1;
}

export function emptySaleUnitRow() {
  return {
    rowId: newUnitRowId(),
    modelKey: '',
    productId: '',
    variantIds: [],
    productName: '',
    brand: '',
    capacity: '',
    color: '',
    colorOptions: [],
    selectedImes: [],
    wholesaleUnitPrice: 0,
    unitPrice: 0,
    quantity: 1,
  };
}

export function normalizeSelectedImes(row) {
  if (!row) return [];
  return (Array.isArray(row.selectedImes) ? row.selectedImes : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
}

export function reservedImesFromSaleRows(saleRows, excludeRowId = '') {
  const set = new Set();
  for (const row of saleRows || []) {
    if (excludeRowId && row.rowId === excludeRowId) continue;
    normalizeSelectedImes(row).forEach((ime) => set.add(ime));
  }
  return set;
}

/** IMEs pickable for a row: on product, not taken by other rows. */
export function availableImesForRow(product, saleRows, rowId) {
  if (!product) return [];
  const reserved = reservedImesFromSaleRows(saleRows, rowId);
  const current = new Set(normalizeSelectedImes(saleRows.find((r) => r.rowId === rowId)));
  return productImeList(product).filter((ime) => !reserved.has(ime) || current.has(ime));
}

/** Pick the inventory variant that matches the row's selected storage. */
export function saleRowPrimaryVariant(row, products = []) {
  const pool = saleRowVariantProducts(row, products);
  if (!pool.length) return null;
  const cap = String(row?.capacity || '').trim();
  if (cap) {
    const match = pool.find((p) => pricingCapacitiesMatch(p?.capacity, cap));
    if (match) return match;
  }
  const id = String(row?.productId || '').trim();
  return pool.find((p) => productKey(p) === id) || pool[0];
}

/** Product identity used to match the Pricing catalog (name, brand, capacity). */
function productForPricingLookup(product, row = null) {
  if (!product) return null;
  const capacity =
    String(row?.capacity || '').trim() ||
    String(product?.capacity || '').trim();
  return {
    ...product,
    product_name:
      String(row?.productName || product?.product_name || product?.productName || '').trim() ||
      product?.product_name,
    brand: String(row?.brand || product?.brand || '').trim() || product?.brand,
    capacity,
  };
}

/** Retail + vendor unit prices for a direct sale line (Pricing catalog when available). */
export function resolveDirectSaleUnitPrices(
  product,
  { pricingCatalog = [], pricingLookup = null, saleType = 'retail', row = null } = {},
) {
  const lookupProduct = productForPricingLookup(product, row);
  const catalogMatch = findPricingCatalogMatch(lookupProduct, pricingCatalog, {
    requireCapacity: Boolean(String(lookupProduct?.capacity || '').trim()),
  });

  const catalogPricing = catalogMatch
    ? {
        retail: Number(catalogMatch.retailPrice) > 0 ? Number(catalogMatch.retailPrice) : null,
        wholesale:
          Number(catalogMatch.wholesalePrice) > 0 ? Number(catalogMatch.wholesalePrice) : null,
      }
    : resolveInventoryPricing(lookupProduct, pricingLookup);

  const wholesaleUnitPrice =
    catalogPricing.wholesale > 0 ? catalogPricing.wholesale : resolveProductWholesalePrice(lookupProduct);

  let retailUnitPrice = 0;
  for (const raw of [catalogPricing.retail, lookupProduct?.retailPrice]) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      retailUnitPrice = n;
      break;
    }
  }
  if (!retailUnitPrice) retailUnitPrice = wholesaleUnitPrice;

  const isWholesale = String(saleType || '').toLowerCase() === 'wholesale';
  return {
    wholesaleUnitPrice,
    retailUnitPrice,
    unitPrice: isWholesale ? wholesaleUnitPrice : retailUnitPrice,
  };
}

/** Re-apply catalog retail/vendor prices on an existing sale row (keeps IME/qty selections). */
export function refreshSaleRowCatalogPrices(row, products = [], options = {}) {
  const product = saleRowPrimaryVariant(row, products);
  if (!product || !String(row?.productId || '').trim()) return row;
  const { wholesaleUnitPrice, retailUnitPrice, unitPrice } = resolveDirectSaleUnitPrices(product, {
    ...options,
    row,
  });
  return { ...row, wholesaleUnitPrice, retailUnitPrice, unitPrice };
}

export function applyProductToSaleRow(row, product, options = {}) {
  if (!product) {
    return {
      ...row,
      modelKey: '',
      productId: '',
      variantIds: [],
      productName: '',
      brand: '',
      capacity: '',
      color: '',
      colorOptions: [],
      selectedImes: [],
      wholesaleUnitPrice: 0,
      unitPrice: 0,
    };
  }
  const capacity = String(row?.capacity || product?.capacity || '').trim();
  const { wholesaleUnitPrice, retailUnitPrice, unitPrice } = resolveDirectSaleUnitPrices(product, {
    ...options,
    row: { ...row, capacity },
  });
  return {
    ...row,
    modelKey:
      String(row?.modelKey || '').trim() ||
      `${String(product?.brand || '').trim().toLowerCase()}::${String(product?.product_name || '').trim().toLowerCase()}`,
    productId: String(product._id ?? product.id ?? ''),
    variantIds: Array.isArray(row?.variantIds) && row.variantIds.length
      ? row.variantIds
      : [String(product._id ?? product.id ?? '')],
    productName: row?.productName || product.product_name || 'Product',
    brand: row?.brand || product.brand || '',
    capacity,
    color: product.color || row.color || '',
    colorOptions: [],
    wholesaleUnitPrice,
    retailUnitPrice,
    unitPrice,
    selectedImes: [],
  };
}

export function isSaleRowComplete(row) {
  if (!String(row?.productId || '').trim()) return false;
  return saleRowQuantityOrNull(row) != null;
}

export function countSaleRowsForProduct(productId, saleRows, excludeRowId = '') {
  return (saleRows || [])
    .filter((row) => {
      if (String(row.productId) !== String(productId)) return false;
      if (excludeRowId && row.rowId === excludeRowId) return false;
      return true;
    })
    .reduce((sum, row) => sum + (saleRowQuantityOrNull(row) || 0), 0);
}

/** Units already claimed by other rows whose storage pool overlaps the given variant ids. */
export function countSaleRowsForPool(variantIds, saleRows, excludeRowId = '') {
  const wanted = new Set((variantIds || []).map((v) => String(v || '').trim()).filter(Boolean));
  if (!wanted.size) return 0;
  return (saleRows || [])
    .filter((row) => {
      if (excludeRowId && row.rowId === excludeRowId) return false;
      return saleRowVariantIds(row).some((id) => wanted.has(id));
    })
    .reduce((sum, row) => sum + (saleRowQuantityOrNull(row) || 0), 0);
}

export function totalSaleUnits(saleRows) {
  return (saleRows || [])
    .filter(isSaleRowComplete)
    .reduce((sum, row) => sum + saleRowQuantity(row), 0);
}

/**
 * Build purchase lines from sale rows. When `products` is provided, each selected
 * IME is attributed to its owning product line (color variant), so one sale row
 * covering several colors is split into one line per variant for the API.
 * @param {UnitRow[]} saleRows
 */
export function buildPurchaseLinesFromRows(saleRows, products = []) {
  const complete = (saleRows || []).filter(isSaleRowComplete);
  const byProduct = new Map();

  const ensureLine = (productId, row, { color, wholesaleUnitPrice, unitPrice }) => {
    const key = `${productId}::${unitPrice}`;
    if (!byProduct.has(key)) {
      byProduct.set(key, {
        id: newLineId(),
        productId,
        productName: row.productName || 'Product',
        brand: row.brand || '',
        capacity: row.capacity || '',
        color: color || '',
        quantity: 0,
        wholesaleUnitPrice,
        unitPrice,
        unitRows: [],
      });
    }
    return byProduct.get(key);
  };

  for (const row of complete) {
    const rowProductId = String(row.productId || '').trim();
    const wholesaleUnitPrice = Number(row.wholesaleUnitPrice) || 0;
    const unitPrice = Number(row.unitPrice) > 0 ? Number(row.unitPrice) : wholesaleUnitPrice;
    const selected = normalizeSelectedImes(row);
    const qty = saleRowQuantity(row);
    const owners =
      selected.length > 0 && (products || []).length
        ? imeOwnerMap(saleRowVariantProducts(row, products))
        : null;

    if (selected.length > 0) {
      selected.forEach((ime, i) => {
        const owner = owners?.get(ime) || null;
        const ownerId = owner ? productKey(owner) : rowProductId;
        const ownerColor = String(owner?.color || row.color || '').trim();
        const line = ensureLine(ownerId || rowProductId, row, {
          color: ownerColor,
          wholesaleUnitPrice,
          unitPrice,
        });
        line.unitRows.push({
          rowId: `${row.rowId}-${i}`,
          ime,
          productName: row.productName || line.productName,
          brand: row.brand || line.brand,
          capacity: row.capacity || line.capacity,
          color: ownerColor || line.color,
          wholesaleUnitPrice: Number(row.wholesaleUnitPrice) || line.wholesaleUnitPrice || 0,
          unitPrice: Number(row.unitPrice) > 0 ? Number(row.unitPrice) : line.unitPrice,
        });
      });
    } else {
      const line = ensureLine(rowProductId, row, {
        color: row.color || '',
        wholesaleUnitPrice,
        unitPrice,
      });
      for (let i = 0; i < qty; i += 1) {
        line.unitRows.push({
          rowId: `${row.rowId}-${i}`,
          ime: '',
          productName: row.productName || line.productName,
          brand: row.brand || line.brand,
          capacity: row.capacity || line.capacity,
          color: row.color || line.color,
          wholesaleUnitPrice: Number(row.wholesaleUnitPrice) || line.wholesaleUnitPrice || 0,
          unitPrice: Number(row.unitPrice) > 0 ? Number(row.unitPrice) : line.unitPrice,
        });
      }
    }
  }

  return Array.from(byProduct.values()).map(syncLineQuantity);
}

export function lineUnitCount(line) {
  if (!line) return 0;
  if (Array.isArray(line.unitRows)) return line.unitRows.length;
  return Math.max(0, Number(line.quantity) || 0);
}

export function syncLineQuantity(line) {
  return { ...line, quantity: lineUnitCount(line) };
}

export function saleRowsGrandTotal(saleRows) {
  return (saleRows || [])
    .filter(isSaleRowComplete)
    .reduce((sum, row) => {
      const wholesale = Number(row.wholesaleUnitPrice) || 0;
      const unit = Number(row.unitPrice) > 0 ? Number(row.unitPrice) : wholesale;
      return sum + unit * saleRowQuantity(row);
    }, 0);
}

export function completeSaleRowCount(saleRows) {
  return totalSaleUnits(saleRows);
}

/** @param {PurchaseLine[]} purchaseLines */
export function cartGrandTotal(purchaseLines) {
  return (purchaseLines || []).reduce((sum, line) => {
    const count = lineUnitCount(line);
    return sum + (Number(line.unitPrice) || 0) * count;
  }, 0);
}

/** @param {PurchaseLine[]} purchaseLines */
export function cartAllUnitRows(purchaseLines) {
  const rows = [];
  for (const line of purchaseLines || []) {
    for (const unit of line.unitRows || []) {
      rows.push({
        ...unit,
        lineId: line.id,
        productId: line.productId,
      });
    }
  }
  return rows;
}

/** @param {PurchaseLine[]} purchaseLines */
export function cartItemsForApi(purchaseLines) {
  return (purchaseLines || [])
    .map((line) => ({
      productId: line.productId,
      quantity: lineUnitCount(line),
      wholesaleUnitPrice: Number(line.wholesaleUnitPrice) || 0,
      unitPrice: Number(line.unitPrice) || 0,
      imeCodes: (line.unitRows || []).map((u) => u.ime).filter(Boolean),
    }))
    .filter((item) => item.productId && item.quantity > 0);
}

export function validateRowImeSelection(row, product, products = []) {
  if (!row?.productId || !product) return '';
  const qty = saleRowQuantityOrNull(row);
  if (qty == null) return 'Enter a quantity for this product.';
  const registered = (products || []).length
    ? saleRowPoolImeList(row, products)
    : productImeList(product);
  if (!registered.length) return '';
  const selected = normalizeSelectedImes(row);
  if (selected.length !== qty) {
    return `Select ${qty} IME(s) for ${product.product_name || 'this product'}.`;
  }
  return '';
}
