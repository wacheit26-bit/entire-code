import { locationProductLines } from './mergeInventoryProducts';

/** Collect registered IME/serial codes from a product line. */
export function normalizedImeList(product) {
  if (!product) return [];
  const fromArray = Array.isArray(product?.imeCodes)
    ? product.imeCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  if (fromArray.length) return fromArray;
  const single = String(product?.IME || '').trim();
  return single ? [single] : [];
}

/** First N IME codes that would move with a quantity transfer. */
export function imeCodesForTransferQuantity(product, quantity) {
  const all = normalizedImeList(product);
  if (!all.length) return [];
  const qty = Math.max(1, parseInt(quantity, 10) || 0);
  const takeCount = Math.min(qty, all.length);
  return all.slice(0, takeCount);
}

/** Units on one product line — registered IMEs when present, otherwise stock. */
export function productLineUnitCount(product) {
  if (!product) return 0;
  const imes = normalizedImeList(product);
  const stock = Math.max(0, Number(product?.stock) || 0);
  return imes.length > 0 ? imes.length : stock;
}

/** Alias used by catalog merge / vendor shop stock display. */
export function resolveEffectiveLineStock(product) {
  return productLineUnitCount(product);
}

/** Total physical units across all raw inventory product lines. */
export function countInventoryUnits(products) {
  const list = Array.isArray(products) ? products : [];
  return list.reduce((sum, p) => sum + productLineUnitCount(p), 0);
}

/** Total physical units on a merged inventory row (IMEs when registered, else stock). */
export function inventoryRowUnitCount(row) {
  const imes = inventoryRowImeCodes(row);
  if (imes.length > 0) return imes.length;
  return Math.max(0, Number(row?.stock) || 0);
}

/** All IME codes on an inventory row (single doc or merged locations). */
export function inventoryRowImeCodes(row) {
  if (!row) return [];
  const codes = new Set();
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  if (locations.length) {
    for (const loc of locations) {
      for (const product of locationProductLines(loc)) {
        for (const ime of normalizedImeList(product)) codes.add(ime);
      }
    }
  } else {
    for (const ime of normalizedImeList(row)) codes.add(ime);
  }
  return [...codes];
}

/** Total units on merged inventory rows (deduped IMEs per merged product). */
export function sumMergedInventoryUnits(mergedRows) {
  const rows = Array.isArray(mergedRows) ? mergedRows : [];
  return rows.reduce((sum, row) => sum + inventoryRowUnitCount(row), 0);
}

/**
 * Flatten a merged inventory row into one table row per unit / IME.
 */
export function inventoryUnitDetailRows(row) {
  if (!row) return [];
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  if (!locations.length) {
    return productLineUnitRows(row, { areaLabel: '' });
  }
  const detailRows = [];

  for (const loc of locations) {
    const areaLabel = loc?.label || '';
    for (const p of locationProductLines(loc)) {
      const productId = String(p?._id ?? p?.id ?? loc?.productId ?? '').trim();
      if (!productId) continue;

      const imes = normalizedImeList(p);
      const stock = Math.max(0, Number(p?.stock) || 0);
      const base = {
        productId,
        product: p,
        area: areaLabel,
        capacity: String(loc?.capacity || p?.capacity || '').trim(),
        color: String(loc?.color || p?.color || '').trim(),
        shipment: String(loc?.shipment || p?.shipmentStatus || 'arrived').toLowerCase(),
        bulkBatchCode: p?.bulkBatchCode ? String(p.bulkBatchCode) : '',
        isBulk: Boolean(p?.bulkBatchCode || p?.bulkShipment),
      };

      if (imes.length > 0) {
        for (const ime of imes) {
          detailRows.push({
            ...base,
            ime,
            rowKey: `${productId}|${ime}`,
            units: 1,
          });
        }
        for (let i = imes.length; i < stock; i += 1) {
          detailRows.push({
            ...base,
            ime: '',
            rowKey: `${productId}|unit-${i}`,
            units: 1,
          });
        }
        continue;
      }

      const unitCount = Math.max(1, stock);
      for (let i = 0; i < unitCount; i += 1) {
        detailRows.push({
          ...base,
          ime: '',
          rowKey: `${productId}|unit-${i}`,
          units: 1,
        });
      }
    }
  }

  return detailRows;
}

/** Expand a single product line into unit / IME rows (sales units tab). */
export function productLineUnitRows(product, { areaLabel = '' } = {}) {
  if (!product) return [];
  const productId = String(product?._id ?? product?.id ?? '').trim();
  if (!productId) return [];

  return inventoryUnitDetailRows({
    locations: [
      {
        productId,
        label: areaLabel,
        stock: Math.max(0, Number(product?.stock) || 0),
        shipment: String(product?.shipmentStatus || 'arrived').toLowerCase(),
        capacity: String(product?.capacity || '').trim(),
        color: String(product?.color || '').trim(),
        product,
      },
    ],
  });
}

/** Build manifest rows for display or CSV export. */
export function buildTransferImeManifest(product, quantity) {
  const codes = imeCodesForTransferQuantity(product, quantity);
  return codes.map((ime) => ({
    ime,
    productName: product?.product_name || '',
    brand: product?.brand || '',
    capacity: product?.capacity || '',
    color: product?.color || '',
    bulkBatchCode: product?.bulkBatchCode || null,
  }));
}
