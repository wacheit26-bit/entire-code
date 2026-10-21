import { isTunneledPreorderOrder } from '../constants/preorderOrderTunnel';

import { toMonthKey } from './orderMonthUtils';



export const ORDERS_MONTH_ALL = '__all__';



export function orderMonthKey(o) {

  const fromDate = toMonthKey(o?.handledAt || o?.createdAt || o?.updatedAt);

  if (fromDate) return fromDate;

  const id = o?._id ?? o?.id;

  if (!id) return '';

  try {

    const s = String(id);

    if (/^[a-f0-9]{24}$/i.test(s)) {

      const seconds = parseInt(s.slice(0, 8), 16);

      const d = new Date(seconds * 1000);

      if (!Number.isNaN(d.getTime())) return toMonthKey(d.toISOString());

    }

  } catch {

    /* ignore */

  }

  return '';

}

function dateFromMongoId(id) {
  if (!id) return null;
  try {
    const s = String(id);
    if (/^[a-f0-9]{24}$/i.test(s)) {
      const seconds = parseInt(s.slice(0, 8), 16);
      const d = new Date(seconds * 1000);
      if (!Number.isNaN(d.getTime())) return d;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Best-effort order timestamp from known fields or Mongo ObjectId. */
export function orderTimestamp(o) {
  const candidates = [
    o?.handledAt,
    o?.createdAt,
    o?.updatedAt,
    o?.orderDate,
    o?.date,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return dateFromMongoId(o?._id ?? o?.id);
}

/** Human-readable order date for tables and exports. */
export function orderDisplayDate(o, locale = 'en-GB') {
  const d = orderTimestamp(o);
  if (!d) return '—';
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}



import { formatMoneyXaf } from './formatMoneyXaf';



export function formatMoney(v) {

  return formatMoneyXaf(v);

}



export function orderId(o) {

  return String(o?._id ?? o?.id ?? '');

}

/** Human-readable order reference, e.g. 2026/04/000001 */
export function orderDisplayCode(o) {
  const stored = String(o?.orderCode || o?.displayOrderId || '').trim();
  if (stored) return stored;
  return '—';
}



export function orderProductName(o) {

  return o?.productName || o?.productId?.product_name || o?.product?.product_name || 'Product';

}

export function orderProductCapacity(o) {
  const fromProduct = o?.productId?.capacity ?? o?.product?.capacity ?? o?.customProduct?.capacity;
  if (fromProduct != null && String(fromProduct).trim()) return String(fromProduct).trim();
  const manifest = Array.isArray(o?.directSale?.imeManifest) ? o.directSale.imeManifest : [];
  const fromManifest = manifest.find((line) => String(line?.capacity || '').trim())?.capacity;
  if (fromManifest) return String(fromManifest).trim();
  return '';
}

export function orderBusinessName(o) {

  return o?.businessName || o?.userId?.businessName || '—';

}



export function orderBusinessAddress(o) {

  return o?.businessAddress || o?.userId?.businessAddress || o?.userId?.deliveryAddress || '—';

}



export function orderTel(o) {

  return o?.tel || o?.userId?.tel || '—';

}



export function orderWhatsappNumber(o) {

  return (

    o?.whatsappNumber ||

    o?.userId?.whatsappNumber ||

    o?.userId?.whatsapp ||

    o?.user?.whatsappNumber ||

    o?.user?.whatsapp ||

    o?.userId?.tel ||

    '—'

  );

}



export function normalizeOrderStatus(status) {

  const s = String(status || '').toLowerCase().trim();

  if (s === 'accepted' || s === 'approved' || s === 'fulfilled' || s === 'completed') return 'accepted';

  if (s === 'rejected' || s === 'declined' || s === 'cancelled' || s === 'canceled') return 'rejected';

  if (s === 'pending' || s === 'received' || s === 'new') return 'received';

  return 'received';

}



export function normalizeOrderKind(o) {

  const t = String(o?.orderType ?? o?.type ?? '').toLowerCase().trim();

  if (t === 'preorder') return 'preorder';

  if (t === 'offer' && isTunneledPreorderOrder(o)) return 'preorder';

  if (t === 'offer') return 'offer';

  return 'buy';

}



function hasInShopDirectSaleMarkers(o) {

  const u = String(o?.userNotes || '');

  if (/\[Direct sale\s*[—-]\s*in-Shop/i.test(u) || /\[Direct sale\s*[—-]\s*in-store\]/i.test(u)) {

    return true;

  }

  const staff = String(o?.staffNotes || '');

  if (

    staff.includes('Direct In-Shop sale') ||

    staff.includes('Direct in-store sale') ||

    staff.includes('Direct retail in-shop sale') ||

    staff.includes('Direct wholesale in-shop sale')

  ) {

    return true;

  }

  const src = String(o?.metadata?.source ?? '').toLowerCase().trim();

  return (

    src === 'direct' ||

    src === 'direct_sale' ||

    src === 'in_store' ||

    src === 'direct_sale_wholesale' ||

    src === 'direct_sale_retail'

  );

}



/** Buy orders placed through the vendor storefront (not in-shop direct sale). */

export function isVendorWebBuyOrder(order) {

  if (normalizeOrderKind(order) !== 'buy') return false;

  if (hasInShopDirectSaleMarkers(order)) return false;



  const source = String(order?.directSale?.source || '').toLowerCase();

  if (source === 'vendor_web') return true;



  const meta = String(order?.metadata?.source || '').toLowerCase();

  if (meta === 'web') return true;



  if (order?.directSale?.fulfillmentFallback != null) return true;

  if (String(order?.directSale?.vendorCity || '').trim()) return true;



  const notify = String(order?.notifyAudience || '').toLowerCase();

  if (

    notify === 'salesman'

    && (order?.directSale?.assignedWarehouseId || order?.directSale?.assignedWarehouseName)

  ) {

    return true;

  }



  return Boolean(order?.directSale?.assignedWarehouseId || order?.directSale?.assignedWarehouseName);

}



/** In-shop direct sale recorded by a salesperson (retail/wholesale at the shop). */

export function isDirectOrder(o) {

  if (isVendorWebBuyOrder(o)) return false;



  const directType = String(o?.directSale?.type || '').toLowerCase().trim();

  if (directType === 'retail' || directType === 'wholesale') return true;



  return hasInShopDirectSaleMarkers(o);

}



/** Site/vendor buy orders shown under the Buy tab (excludes in-shop direct sales). */

export function isSiteBuyOrder(order) {

  return isVendorWebBuyOrder(order) || (normalizeOrderKind(order) === 'buy' && !isDirectOrder(order));

}



export function orderAmount(order) {

  const qty = orderEffectiveQuantity(order);

  const storedTotal = Number(
    order?.finalPrice ?? order?.originalTotal ?? order?.totalAmount ?? order?.total ?? order?.amount,
  );
  const rawReceipt = order?.directSale?.receiptGrandTotal;
  const hasReceipt = rawReceipt != null && rawReceipt !== '';
  const receiptTotal = hasReceipt ? Number(rawReceipt) : NaN;

  if (Number.isFinite(storedTotal) && storedTotal >= 0) {
    if (hasReceipt && Number.isFinite(receiptTotal)) {
      if (Math.abs(storedTotal - receiptTotal) > 1) return storedTotal;
      return receiptTotal;
    }
    return storedTotal;
  }

  if (hasReceipt && Number.isFinite(receiptTotal) && receiptTotal >= 0) {
    return receiptTotal;
  }

  const lumpTotal = Number(
    order?.totalAmount ?? order?.total ?? order?.amount ?? order?.finalPrice ?? order?.originalTotal,
  );

  if (isDirectOrder(order)) {
    if (qty <= 0) {
      if (Number.isFinite(lumpTotal) && lumpTotal > 0) return lumpTotal;
      return 0;
    }

    const directUnit = Number(
      order?.directSale?.soldUnitPrice ??
        order?.productPrice ??
        order?.unitPrice ??
        0,
    );

    if (Number.isFinite(lumpTotal) && lumpTotal > 0) {
      if (!Number.isFinite(directUnit) || directUnit <= 0) return lumpTotal;
      const fromUnits = directUnit * qty;
      if (Math.abs(fromUnits - lumpTotal) > 1) return lumpTotal;
      return fromUnits;
    }

    if (Number.isFinite(directUnit) && directUnit > 0) {
      return directUnit * qty;
    }
  }

  if (Number.isFinite(lumpTotal) && lumpTotal > 0) return lumpTotal;

  const unit = Number(

    order?.finalPrice ??

      order?.offeredPrice ??

      order?.offerAmount ??

      order?.unitPrice ??

      order?.price ??

      order?.productId?.price ??

      order?.product?.price ??

      0,

  );

  return Number.isFinite(unit) && unit > 0 ? unit * qty : 0;

}



export function orderEffectiveQuantity(order) {

  const manifestCount = Array.isArray(order?.directSale?.imeManifest)

    ? order.directSale.imeManifest.filter((line) => String(line?.ime || '').trim()).length

    : 0;

  const soldImeCount = Array.isArray(order?.soldImeCodes)

    ? order.soldImeCodes.filter((code) => String(code || '').trim()).length

    : 0;

  const trackedImeCount = Math.max(manifestCount, soldImeCount);

  if (trackedImeCount > 0) return trackedImeCount;



  const rawQty = Number(order?.quantity);

  if (Number.isFinite(rawQty) && rawQty > 0) return Math.floor(rawQty);



  if (isVendorWebBuyOrder(order)) return 1;

  if (Number.isFinite(rawQty)) return Math.max(0, Math.floor(rawQty));



  return isDirectOrder(order) ? 0 : 1;

}



export function orderProductPrice(order) {

  const n = Number(

    order?.productPrice ??

      order?.product_price ??

      order?.product?.price ??

      order?.productId?.price ??

      NaN,

  );

  if (!Number.isFinite(n) || n < 0) return null;

  return n;

}



export function completedByLabel(order, currentUser) {

  const by =

    order?.handledBy?.name ||

    order?.handledByName ||

    order?.approvedByName ||

    order?.completedByName ||

    '';

  if (by) return String(by);



  const handledById = String(order?.handledBy?._id || order?.handledBy || order?.handledById || '').trim();

  if (handledById && currentUser?.id && handledById === String(currentUser.id)) {

    return currentUser.name || 'You';

  }

  if (handledById) return `Staff (${handledById.slice(0, 8)})`;

  return 'Not specified';

}



export function orderAddressForShopMatch(order) {

  return (

    order?.deliveryInfo?.deliveryAddress ||

    order?.deliveryAddress ||

    order?.businessAddress ||

    order?.userId?.businessAddress ||

    order?.userId?.deliveryAddress ||

    order?.__resolvedBusinessAddress ||

    ''

  );

}



export function orderMatchesShopCity(order, shopCity) {

  const city = String(shopCity || '').trim();

  if (!city) return true;

  const addr = String(orderAddressForShopMatch(order)).toLowerCase();

  return addr.includes(city.toLowerCase());

}



export function orderAssignedShopId(order) {

  const raw = order?.directSale?.assignedWarehouseId ?? order?.assignedWarehouseId ?? '';

  if (raw && typeof raw === 'object') {

    return String(raw._id ?? raw.id ?? '').trim();

  }

  return String(raw || '').trim();

}

/** Shop reference for order filters (direct-sale assigned warehouse). */
export function orderShopRef(order) {
  const directSale = order?.directSale && typeof order.directSale === 'object' ? order.directSale : {};
  const rawId =
    directSale?.assignedWarehouseId?._id ??
    directSale?.assignedWarehouseId?.id ??
    directSale?.assignedWarehouseId ??
    '';
  const id = rawId ? String(rawId) : '';
  const name = String(directSale?.assignedWarehouseName || '').trim();
  const key = id || name;
  return { id, name, key };
}

/** Salesperson reference for order filters (handled-by staff). */
export function orderSalespersonRef(order) {
  const handledBy = order?.handledBy;
  const id =
    handledBy && typeof handledBy === 'object'
      ? String(handledBy?._id || handledBy?.id || '')
      : String(order?.handledBy || '').trim();
  const name = String(
    (handledBy && typeof handledBy === 'object' ? handledBy?.name : '') ||
      order?.handledByName ||
      order?.completedByName ||
      'Staff',
  ).trim();
  const key = id || name;
  return { id, name, key };
}



/** Match an order to a shop — direct sales use assigned warehouse; site orders use city. */

export function orderMatchesShop(order, shop) {

  if (!shop) return true;



  const shopId = String(shop._id ?? shop.id ?? '').trim();

  const assignedId = orderAssignedShopId(order);

  if (shopId && assignedId && shopId === assignedId) return true;



  const shopName = String(shop.name || '').trim();

  const assignedName = String(order?.directSale?.assignedWarehouseName || '').trim();

  if (shopName && assignedName && shopName.toLowerCase() === assignedName.toLowerCase()) {

    return true;

  }



  if (isVendorWebBuyOrder(order) && assignedId) return false;



  const shopCity = String(shop.city || '').trim();

  if (shopCity) return orderMatchesShopCity(order, shopCity);

  return false;

}



/** Whether an order should appear in shop order lists (includes pending vendor buys). */

export function orderVisibleInShopList(order) {

  return orderEffectiveQuantity(order) > 0 || isVendorWebBuyOrder(order);

}


