import {
  isDirectOrder,
  normalizeOrderStatus,
  orderAmount,
  orderEffectiveQuantity,
  orderMonthKey,
} from './orderDisplay';
import { filterOrdersForShop } from './shopOrderFilter';
import { formatMonthLabel, toMonthKey } from './orderMonthUtils';

/** Fixed commission per phone sold (XAF). */
export const SALESPERSON_EARNINGS_PER_PHONE = 3000;

export function orderQuantity(order) {
  return orderEffectiveQuantity(order);
}

export function orderHandledById(order) {
  return String(order?.handledBy?._id ?? order?.handledBy ?? order?.handledById ?? '').trim();
}

export function isAcceptedSale(order) {
  return normalizeOrderStatus(order?.status) === 'accepted';
}

export function isWholesalePhoneSale(order) {
  return isAcceptedSale(order) && !isDirectOrder(order);
}

export function isRetailPhoneSale(order) {
  return isAcceptedSale(order) && isDirectOrder(order);
}

function normalizedDirectSaleType(order) {
  return String(order?.directSale?.type || '').trim().toLowerCase();
}

function looksLikeWholesaleDirect(order) {
  const userNotes = String(order?.userNotes || '');
  const staffNotes = String(order?.staffNotes || '');
  if (/\bdirect sale\b/i.test(userNotes) && /\bwholesale\b/i.test(userNotes)) return true;
  if (/\bdirect wholesale\b/i.test(staffNotes)) return true;
  if (/\bwholesale in-shop\b/i.test(staffNotes)) return true;
  return false;
}

function isWholesaleDirectInShopSale(order) {
  if (!isAcceptedSale(order)) return false;
  if (!isDirectOrder(order)) return false;
  const type = normalizedDirectSaleType(order);
  if (type === 'wholesale') return true;
  if (type === 'retail') return false;
  return looksLikeWholesaleDirect(order);
}

function isRetailDirectInShopSale(order) {
  if (!isAcceptedSale(order)) return false;
  if (!isDirectOrder(order)) return false;
  return !isWholesaleDirectInShopSale(order);
}

function isWholesaleSiteOrderSale(order) {
  return isAcceptedSale(order) && !isDirectOrder(order);
}

function matchesStaff(order, staffUserId) {
  if (!staffUserId) return true;
  const handlerId = orderHandledById(order);
  if (!handlerId) return false;
  return handlerId === String(staffUserId).trim();
}

function matchesMonth(order, monthKey) {
  if (!monthKey) return true;
  return orderMonthKey(order) === monthKey;
}

/**
 * @param {object[]} orders
 * @param {{ monthKey?: string, staffUserId?: string }} [opts]
 */
export function summarizePhoneSales(orders, opts = {}) {
  const { monthKey, staffUserId } = opts;
  let totalPhones = 0;
  let wholesaleDirectInShopPhones = 0;
  let wholesaleSiteOrderPhones = 0;
  let retailDirectInShopPhones = 0;
  let wholesalePhones = 0;
  let retailPhones = 0;
  let salesValue = 0;

  (orders || []).forEach((order) => {
    if (!isAcceptedSale(order)) return;
    if (!matchesMonth(order, monthKey)) return;
    if (!matchesStaff(order, staffUserId)) return;

    const qty = orderQuantity(order);
    if (qty <= 0) return;
    totalPhones += qty;
    salesValue += orderAmount(order);
    if (isWholesaleDirectInShopSale(order)) {
      wholesaleDirectInShopPhones += qty;
    } else if (isRetailDirectInShopSale(order)) {
      retailDirectInShopPhones += qty;
    } else if (isWholesaleSiteOrderSale(order)) {
      wholesaleSiteOrderPhones += qty;
    }

    // Backward-compatible totals used elsewhere in the dashboard.
    wholesalePhones = wholesaleDirectInShopPhones + wholesaleSiteOrderPhones;
    retailPhones = retailDirectInShopPhones;
  });

  return {
    totalPhones,
    wholesaleDirectInShopPhones,
    wholesaleSiteOrderPhones,
    retailDirectInShopPhones,
    wholesalePhones,
    retailPhones,
    salesValue,
    earnings: totalPhones * SALESPERSON_EARNINGS_PER_PHONE,
  };
}

/**
 * Monthly breakdown of accepted phone sales (shop-level unless staffUserId set).
 * @returns {Array<{ monthKey, label, totalPhones, wholesaleDirectInShopPhones, wholesaleSiteOrderPhones, retailDirectInShopPhones, wholesalePhones, retailPhones, salesValue, earnings }>}
 */
export function buildMonthlyPhoneSalesSeries(orders, opts = {}) {
  const { staffUserId } = opts;
  const map = new Map();

  (orders || []).forEach((order) => {
    if (!isAcceptedSale(order)) return;
    if (!matchesStaff(order, staffUserId)) return;

    const key = orderMonthKey(order);
    if (!key) return;

    const row = map.get(key) || {
      monthKey: key,
      label: formatMonthLabel(key),
      totalPhones: 0,
      wholesaleDirectInShopPhones: 0,
      wholesaleSiteOrderPhones: 0,
      retailDirectInShopPhones: 0,
      wholesalePhones: 0,
      retailPhones: 0,
      salesValue: 0,
      earnings: 0,
    };

    const qty = orderQuantity(order);
    if (qty <= 0) return;
    row.totalPhones += qty;
    row.salesValue += orderAmount(order);
    if (isWholesaleDirectInShopSale(order)) {
      row.wholesaleDirectInShopPhones += qty;
    } else if (isRetailDirectInShopSale(order)) {
      row.retailDirectInShopPhones += qty;
    } else if (isWholesaleSiteOrderSale(order)) {
      row.wholesaleSiteOrderPhones += qty;
    }
    // Backward-compatible totals used elsewhere in the dashboard.
    row.wholesalePhones = row.wholesaleDirectInShopPhones + row.wholesaleSiteOrderPhones;
    row.retailPhones = row.retailDirectInShopPhones;
    row.earnings = row.totalPhones * SALESPERSON_EARNINGS_PER_PHONE;
    map.set(key, row);
  });

  return [...map.values()].sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

export function defaultSalesMonthKey(orders, opts = {}) {
  const series = buildMonthlyPhoneSalesSeries(orders, opts);
  if (series.length) return series[0].monthKey;
  return toMonthKey(new Date());
}

/** Accepted direct (in-shop) sales for a shop, optionally scoped to one salesperson. */
export function summarizeDirectSales(orders, opts = {}) {
  const { monthKey, staffUserId } = opts;
  let totalProducts = 0;
  let totalRevenue = 0;

  (orders || []).forEach((order) => {
    if (!isAcceptedSale(order)) return;
    if (!isDirectOrder(order)) return;
    if (!matchesMonth(order, monthKey)) return;
    if (!matchesStaff(order, staffUserId)) return;
    const qty = orderQuantity(order);
    if (qty <= 0) return;
    totalProducts += qty;
    totalRevenue += orderAmount(order);
  });

  return { totalProducts, totalRevenue };
}

export function buildDirectSalesSeries(orders, opts = {}) {
  const { staffUserId } = opts;
  const map = new Map();

  (orders || []).forEach((order) => {
    if (!isAcceptedSale(order)) return;
    if (!isDirectOrder(order)) return;
    if (!matchesStaff(order, staffUserId)) return;

    const key = orderMonthKey(order);
    if (!key) return;

    const row = map.get(key) || {
      monthKey: key,
      label: formatMonthLabel(key),
      totalProducts: 0,
      totalRevenue: 0,
    };
    const qty = orderQuantity(order);
    if (qty <= 0) return;
    row.totalProducts += qty;
    row.totalRevenue += orderAmount(order);
    map.set(key, row);
  });

  return [...map.values()].sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1));
}

export function isEligiblePortalSale(order) {
  if (!isAcceptedSale(order)) return false;
  if (orderQuantity(order) <= 0) return false;
  if (orderAmount(order) <= 0) return false;
  return true;
}

/** Portal earnings: accepted sales at a shop handled by the salesperson. */
export function filterPortalEarningsOrders(orders, shop, staffUserId) {
  const shopScoped = filterOrdersForShop(orders, shop);
  return shopScoped.filter((order) => {
    if (staffUserId && !matchesStaff(order, staffUserId)) return false;
    return isEligiblePortalSale(order);
  });
}
