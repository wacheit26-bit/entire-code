import { isUsaWarehouseCity } from './warehouseDisplay';

function warehouseType(ref) {
  return String(ref?.type || '').trim().toLowerCase();
}

function isShop(ref) {
  return warehouseType(ref) === 'sub';
}

/** Warehouse or shop name for display (prefers the location name field). */
function locationName(ref, fallback = '') {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  if (typeof ref === 'object') {
    const name = String(ref.name || '').trim();
    if (name) return name;
    const city = String(ref.city || '').trim();
    if (isUsaWarehouseCity(city)) return 'USA Warehouse';
    if (isShop(ref)) return city ? `${city} Shop` : 'Shop';
    return city ? `${city} Warehouse` : fallback;
  }
  return fallback;
}

/** Name of the warehouse stock was sent from. */
function sourceWarehouseName(ref, fallback = '') {
  return locationName(ref, fallback);
}

/** Full location label for tables (current warehouse / shop). */
export function warehouseLabel(ref, fallback = '') {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback || '—';
  if (typeof ref === 'object') {
    const name = String(ref.name || '').trim();
    const city = String(ref.city || '').trim();
    if (name && city && name.toLowerCase() !== city.toLowerCase()) {
      return `${name} (${city})`;
    }
    return name || city || fallback;
  }
  return fallback;
}

export function isProductTravelling(product) {
  return String(product?.shipmentStatus || '').toLowerCase() === 'travelling';
}

function resolveSourceWarehouse(product) {
  const origin = product?.originWarehouse;
  const fromOrigin = sourceWarehouseName(origin, '');
  if (fromOrigin) return fromOrigin;

  const batchMain = product?.bulkShipment?.mainWarehouse;
  const fromBatch = sourceWarehouseName(batchMain, '');
  if (fromBatch) return fromBatch;

  return 'Warehouse unknown';
}

function resolveDestination(product) {
  const destSub = product?.destinationSubWarehouse;
  const destMain = product?.destinationMainWarehouse;
  const current = product?.currentWarehouse;

  if (destSub) {
    return locationName(destSub, locationName(current, 'Shop'));
  }
  if (destMain) {
    return locationName(destMain, locationName(current, 'Warehouse'));
  }
  return locationName(current, 'Destination unknown');
}

/**
 * Source warehouse name → destination for in-transit stock.
 * @returns {{ from: string, to: string, label: string } | null}
 */
export function productTravelRoute(product) {
  if (!isProductTravelling(product)) return null;

  const from = resolveSourceWarehouse(product);
  const to = resolveDestination(product);

  return {
    from,
    to,
    label: `${from} → ${to}`,
  };
}

/** Route label for a bulk batch (main warehouse → shop). */
export function bulkBatchTravelRoute(batch, originWarehouse) {
  const from = sourceWarehouseName(batch?.mainWarehouse || originWarehouse, 'Warehouse unknown');
  const destSub = batch?.destinationSubWarehouse;
  const destMain = batch?.destinationMainWarehouse;
  let to = locationName(destSub, '');
  if (!to) {
    to = locationName(destMain, '');
  }
  if (!to) {
    to = 'Shop not assigned yet';
  }
  return {
    from,
    to,
    label: `${from} → ${to}`,
  };
}

/** Location column text: route when travelling, else current warehouse or shop. */
export function productLocationDisplay(product) {
  const route = productTravelRoute(product);
  if (route) return route.label;

  const current = warehouseLabel(product?.currentWarehouse, '');
  if (current) return current;

  return product?.phoneLocation || '—';
}
