import { warehouseId } from '../api/warehouseApi';
import { productLocationDisplay, productTravelRoute } from './productTravelRoute';

function normalizedImeList(product) {
  if (!product) return [];
  const fromArray = Array.isArray(product?.imeCodes)
    ? product.imeCodes.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  if (fromArray.length) return fromArray;
  const single = String(product?.IME || '').trim();
  return single ? [single] : [];
}

function lineUnitCount(product) {
  if (!product) return 0;
  const imes = normalizedImeList(product);
  const stock = Math.max(0, Number(product?.stock) || 0);
  return imes.length > 0 ? imes.length : stock;
}

function norm(v) {
  return String(v || '')
    .trim()
    .toLowerCase();
}

/**
 * Group inventory rows by variant (name, brand, capacity, color).
 * Bulk uploads with different models no longer collapse into one deletable row.
 */
export function inventoryProductKey(product) {
  return [
    norm(product?.product_name),
    norm(product?.brand),
    norm(product?.capacity),
    norm(product?.color),
  ].join('|');
}

/** Same as inventoryProductKey — variant identity for pricing / lookups. */
export function inventoryVariantKey(product) {
  return inventoryProductKey(product);
}

/** True when a merged row has more than one inventory document at any location. */
export function inventoryMergedRowHasMultipleProductDocs(row) {
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  return locations.some((loc) => {
    const ids = Array.isArray(loc?.productIds) ? loc.productIds : [];
    if (ids.length > 1) return true;
    const lines = locationProductLines(loc);
    return lines.length > 1;
  });
}

export function inventoryLocationLabel(p) {
  return productLocationDisplay(p);
}

function productId(product) {
  return String(product?._id ?? product?.id ?? '').trim();
}

function shipmentStatus(product) {
  const s = String(product?.shipmentStatus || 'arrived').toLowerCase();
  return s === 'travelling' ? 'travelling' : 'arrived';
}

function buildLocationEntry(product) {
  const id = productId(product);
  if (!id) return null;
  const stock = lineUnitCount(product);
  return {
    areaKey: inventoryAreaKey(product),
    productId: id,
    label: inventoryLocationLabel(product),
    stock,
    shipment: shipmentStatus(product),
    capacity: String(product?.capacity || '').trim(),
    color: String(product?.color || '').trim(),
    product,
    products: [product],
    productIds: [id],
  };
}

/** Stable key for a warehouse, shop, or in-transit destination — not per product line. */
export function inventoryAreaKey(product) {
  const travelling = shipmentStatus(product) === 'travelling';

  if (travelling) {
    const destId =
      warehouseId(product?.destinationSubWarehouse) ||
      warehouseId(product?.destinationMainWarehouse);
    if (destId) return `dest:${destId}`;

    const currentId = warehouseId(product?.currentWarehouse);
    if (currentId) return `transit:${currentId}`;

    const route = productTravelRoute(product);
    if (route?.label) return `route:${norm(route.label)}`;
  }

  const whId = warehouseId(product?.currentWarehouse);
  if (whId) return `wh:${whId}`;

  const label = norm(inventoryLocationLabel(product));
  if (label && label !== '—') return `label:${label}`;

  return `line:${productId(product)}`;
}

/** Product lines represented by a merged inventory location entry. */
export function locationProductLines(loc) {
  if (Array.isArray(loc?.products) && loc.products.length) return loc.products;
  if (loc?.product) return [loc.product];
  return [];
}

/** Merge product lines that share the same warehouse / shop / destination. */
export function consolidateLocationsByArea(entries = []) {
  const byArea = new Map();

  for (const entry of entries) {
    if (!entry) continue;
    const key = entry.areaKey || inventoryAreaKey(entry.product);
    if (!key) continue;

    if (!byArea.has(key)) {
      byArea.set(key, {
        areaKey: key,
        productId: entry.productId,
        label: entry.label,
        stock: 0,
        shipment: entry.shipment,
        capacities: new Set(),
        colors: new Set(),
        product: entry.product,
        products: [],
        productIds: [],
      });
    }

    const group = byArea.get(key);
    group.stock += lineUnitCount(entry.product);
    group.products.push(entry.product);
    group.productIds.push(entry.productId);
    if (entry.capacity) group.capacities.add(entry.capacity);
    if (entry.color) group.colors.add(entry.color);
    if (entry.shipment === 'travelling') group.shipment = 'travelling';
  }

  return [...byArea.values()].map((group) => {
    const capacities = [...group.capacities];
    const colors = [...group.colors];
    return {
      areaKey: group.areaKey,
      productId: group.productIds[0] || '',
      label: group.label,
      stock: group.stock,
      shipment: group.shipment,
      capacity: capacities.length === 1 ? capacities[0] : capacities.join(' · '),
      color: colors.length === 1 ? colors[0] : colors.join(' · '),
      product: group.product,
      products: group.products,
      productIds: group.productIds,
    };
  });
}

function productTimestamp(p) {
  const raw = p?.releaseDate || p?.releasedAt || p?.createdAt || p?.updatedAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function capacitySort(a, b) {
  const na = parseInt(String(a).replace(/\D/g, ''), 10) || 0;
  const nb = parseInt(String(b).replace(/\D/g, ''), 10) || 0;
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

function buildVariants(rawRows) {
  const byCapacity = new Map();
  for (const raw of rawRows) {
    const cap = String(raw?.capacity || '').trim() || '—';
    if (!byCapacity.has(cap)) byCapacity.set(cap, []);
    byCapacity.get(cap).push(raw);
  }

  const variants = [];
  for (const [capacity, rows] of byCapacity.entries()) {
    const locations = consolidateLocationsByArea(rows.map(buildLocationEntry).filter(Boolean));
    const stock = locations.reduce((sum, loc) => sum + loc.stock, 0);
    variants.push({
      capacity,
      stock,
      locations,
      products: rows,
    });
  }

  variants.sort((a, b) => capacitySort(a.capacity, b.capacity));
  return variants;
}

/**
 * Merge duplicate inventory rows (same product name; multiple storages/locations).
 */
export function mergeInventoryProducts(products) {
  const list = Array.isArray(products) ? products : [];
  const groups = new Map();

  list.forEach((raw) => {
    const key = inventoryProductKey(raw);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(raw);
  });

  const merged = [];

  groups.forEach((rows, key) => {
    const variants = buildVariants(rows);
    const locations = consolidateLocationsByArea(rows.map(buildLocationEntry).filter(Boolean));
    if (locations.length === 0) return;

    const capacities = variants.map((v) => v.capacity).filter((c) => c && c !== '—');
    const sorted = [...rows].sort((a, b) => productTimestamp(b) - productTimestamp(a));
    const primary = sorted[0];
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);
    const uniqueColors = [...new Set(rows.map((r) => String(r?.color || '').trim()).filter(Boolean))];

    merged.push({
      ...primary,
      __inventoryKey: key,
      __mergedCount: rows.length,
      __variantCount: variants.length,
      capacities,
      variants,
      locations,
      stock: totalStock,
      __colors: uniqueColors,
    });
  });

  return merged;
}

/** Distinct storage options across merged inventory rows. */
export function inventoryCapacityOptions(mergedRows = []) {
  const set = new Set();
  for (const row of mergedRows) {
    for (const cap of row?.capacities || []) {
      if (cap && cap !== '—') set.add(cap);
    }
  }
  return [...set].sort(capacitySort);
}

/** Distinct product names across merged inventory rows. */
export function inventoryProductNameOptions(mergedRows = []) {
  const names = new Set();
  for (const row of mergedRows) {
    const name = String(row?.product_name || '').trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Narrow a merged row to one storage variant (stock, locations, IME scope).
 */
export function pickInventoryCapacityVariant(row, capacity = '') {
  const cap = String(capacity || '').trim();
  if (!cap || !row) {
    return {
      row,
      variant: null,
      locations: Array.isArray(row?.locations) ? row.locations : [],
      stock: Math.max(0, Number(row?.stock) || 0),
    };
  }

  const variants = Array.isArray(row?.variants) ? row.variants : [];
  const match =
    variants.find((v) => norm(v.capacity) === norm(cap)) ||
    variants.find((v) => String(v.capacity).includes(cap));

  if (!match) {
    return {
      row,
      variant: null,
      locations: [],
      stock: 0,
    };
  }

  const primary = match.products?.[0] || row;
  const baseKey = row.__inventoryKey || inventoryProductKey(row);
  return {
    row: {
      ...primary,
      ...row,
      capacity: match.capacity,
      __filteredCapacity: match.capacity,
      __inventoryRowKey: `${baseKey}|${norm(match.capacity)}`,
      locations: match.locations,
      stock: match.stock,
      variants: [match],
    },
    variant: match,
    locations: match.locations,
    stock: match.stock,
  };
}

/**
 * When a product name is selected, show one table row per storage variant.
 */
export function expandInventoryByStorage(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const expanded = [];

  for (const row of list) {
    const variants = Array.isArray(row?.variants) ? row.variants : [];
    if (!variants.length) {
      expanded.push(row);
      continue;
    }
    if (variants.length === 1) {
      expanded.push(pickInventoryCapacityVariant(row, variants[0].capacity).row);
      continue;
    }
    for (const variant of variants) {
      expanded.push(pickInventoryCapacityVariant(row, variant.capacity).row);
    }
  }

  return expanded;
}

/**
 * Distinct storage capacities for one merged inventory row.
 */
export function inventoryStorageOptionsForRow(row) {
  const caps = Array.isArray(row?.capacities) ? row.capacities.filter((c) => c && c !== '—') : [];
  if (caps.length) return [...caps].sort(capacitySort);
  const single = String(row?.capacity || '').trim();
  return single && single !== '—' ? [single] : [];
}

/**
 * Filter merged inventory by product name search and optional storage.
 * @param {boolean} [expandWithoutCapacity=true] — when false, a product filter alone
 *   keeps one merged row until a storage is chosen (admin inventory drill-down).
 */
export function filterMergedInventory(
  mergedRows = [],
  { nameQuery = '', capacity = '', expandWithoutCapacity = true } = {},
) {
  let rows = Array.isArray(mergedRows) ? mergedRows : [];
  const q = norm(nameQuery);

  if (q) {
    rows = rows.filter((row) => norm(row?.product_name) === q);
  }

  const cap = String(capacity || '').trim();
  if (cap) {
    return rows
      .filter((row) => (row?.capacities || []).some((c) => norm(c) === norm(cap)))
      .map((row) => pickInventoryCapacityVariant(row, cap).row);
  }

  if (q && expandWithoutCapacity) {
    return expandInventoryByStorage(rows);
  }

  return rows;
}

/** One table row per product line when a storage variant is selected (detail drill-down). */
export function inventoryProductLineDetailRows(row) {
  if (!row) return [];
  const detailRows = [];

  for (const loc of row.locations || []) {
    for (const p of locationProductLines(loc)) {
      const id = productId(p);
      if (!id) continue;
      const areaKey = loc?.areaKey || norm(loc?.label || '');
      const color = String(p?.color || '').trim();
      detailRows.push({
        productId: id,
        product: p,
        area: loc?.label || '',
        color,
        capacity: String(p?.capacity || loc?.capacity || row?.capacity || '').trim(),
        stock: lineUnitCount(p),
        shipment: String(loc?.shipment || p?.shipmentStatus || 'arrived').toLowerCase(),
        bulkBatchCode: p?.bulkBatchCode ? String(p.bulkBatchCode) : '',
        isBulk: Boolean(p?.bulkBatchCode || p?.bulkShipment),
        rowKey: `${id}|${areaKey}|${norm(color)}`,
      });
    }
  }

  return detailRows;
}

export function inventoryRowKey(row) {
  if (row?.__inventoryRowKey) return row.__inventoryRowKey;
  return row?.__inventoryKey || inventoryProductKey(row) || String(row?._id ?? row?.id ?? '');
}

export function formatInventoryCapacities(row) {
  if (row?.__filteredCapacity) return row.__filteredCapacity;
  const caps = Array.isArray(row?.capacities) ? row.capacities.filter(Boolean) : [];
  if (caps.length === 0) return row?.capacity || '—';
  if (caps.length === 1) return caps[0];
  return caps.join(' · ');
}

export function inventoryColorOptions(row) {
  const colors = new Set();

  if (row?.__filteredCapacity) {
    for (const loc of row.locations || []) {
      for (const product of locationProductLines(loc)) {
        const c = String(product?.color || '').trim();
        if (c) colors.add(c);
      }
      const locColor = String(loc?.color || '').trim();
      if (locColor && !locColor.includes('·')) {
        colors.add(locColor);
      }
    }
  } else if (Array.isArray(row?.__colors) && row.__colors.length) {
    for (const c of row.__colors) {
      const s = String(c || '').trim();
      if (s) colors.add(s);
    }
  } else {
    const single = String(row?.color || '').trim();
    if (single) colors.add(single);
  }

  return [...colors].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function formatInventoryColors(row) {
  const list = inventoryColorOptions(row);
  if (list.length === 0) return '—';
  if (list.length === 1) return list[0];
  return `${list.length} colors`;
}

export function pickInventoryLocation(row, selectedProductId = '') {
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  if (!locations.length) return { entry: null, product: row };

  const wanted = String(selectedProductId || '').trim();
  if (wanted) {
    for (const loc of locations) {
      const ids = Array.isArray(loc?.productIds) ? loc.productIds : [loc.productId];
      const idx = ids.findIndex((id) => String(id) === wanted);
      if (idx !== -1) {
        const product = loc.products?.[idx] || loc.products?.[0] || loc.product || row;
        return { entry: loc, product };
      }
    }
  }

  const first = locations[0];
  const product = first?.products?.[0] || first?.product || row;
  return { entry: first, product };
}

/** Number of distinct warehouses / shops where a merged row has stock. */
export function inventoryAreaCount(row) {
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  return locations.length;
}
