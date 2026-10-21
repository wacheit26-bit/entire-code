import { postOrderRequest } from './ordersApi';
import { patchOrderAccept } from './ordersListApi';
import { deliveryAddressPayloadForOrderAccept } from '../data/businessLocations';
import { withDirectSalePaymentMethod } from '../utils/directSalePaymentMethod';
import { postDirectSaleWithRetry } from '../utils/saleErrorMessage';

function pickCreatedOrderId(response) {
  if (!response || typeof response !== 'object') return '';
  /** POST /orders body: { success, message, data: { order: { id }, user } } */
  const payload =
    response.data != null && typeof response.data === 'object' && !Array.isArray(response.data)
      ? response.data
      : response;

  const order = payload.order;
  if (order && typeof order === 'object') {
    const oid = order._id ?? order.id;
    if (oid != null && String(oid).trim()) return String(oid).trim();
  }

  const fallback =
    payload._id ??
    payload.id ??
    payload.orderId ??
    response.orderId ??
    (payload.data && typeof payload.data === 'object'
      ? payload.data._id ?? payload.data.id
      : null);
  if (fallback != null && String(fallback).trim()) return String(fallback).trim();

  return '';
}

/**
 * Record an in-store buy and confirm it so inventory/stock updates like a normal accepted buy.
 * @param {import('axios').AxiosInstance} client
 * @param {object} p
 * @param {string} p.buyerUserId - Mongo user id attached to the order (wholesaler or staff for walk-in)
 * @param {string} p.productId
 * @param {string} p.productName
 * @param {number} p.quantity
 * @param {string} p.handledById - staff user id accepting the sale
 * @param {string} p.deliveryLocationKey - Bamenda | Yaoundé | Douala (BusinessLocationSelect value)
 * @param {string} [p.customerName] - walk-in customer name
 * @param {string} [p.note] - optional short note appended to userNotes
 */
export async function createAndConfirmDirectBuy(client, p) {
  const qty = Math.max(1, Math.floor(Number(p.quantity) || 1));
  const note = String(p.note || '').trim();
  const customerName = String(p.customerName || '').trim();
  const customerPart = customerName ? ` Customer: ${customerName}.` : '';
  const userNotes = `[Direct sale — In-Shop — Retail]${customerPart}${note ? ` ${note}` : ''}`.slice(0, 2000);

  const orderBody = {
    userId: String(p.buyerUserId || '').trim(),
    productId: String(p.productId || '').trim(),
    productName: String(p.productName || '').trim(),
    orderType: 'buy',
    quantity: qty,
    userNotes,
    notifyAudience: 'admin',
  };

  const created = await postOrderRequest(client, orderBody);
  const orderId = pickCreatedOrderId(created);
  if (!orderId) {
    const err = new Error(
      'The sale may have been saved, but the server did not return an order id. Check Orders and confirm manually if needed.',
    );
    err.code = 'MISSING_ORDER_ID';
    throw err;
  }

  const today = new Date().toISOString().slice(0, 10);
  await patchOrderAccept(client, orderId, {
    handledById: String(p.handledById || '').trim(),
    staffNotes: 'Direct retail in-shop sale — auto-confirmed.',
    estimatedDeliveryDate: today,
    deliveryAddress: deliveryAddressPayloadForOrderAccept(p.deliveryLocationKey),
  });

  return { orderId, created };
}

async function postDirectSale(client, paths, payload, { timeout = 60000 } = {}) {
  let lastErr = null;
  for (const path of paths) {
    try {
      const res = await client.post(path, payload, { timeout });
      const body = res.data;
      if (body?.data != null) return body.data;
      return body;
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status;
      const timedOut =
        err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''));
      const canFallback =
        timedOut ||
        status === 404 ||
        status === 405 ||
        status === 401 ||
        status === 403 ||
        (Number.isFinite(Number(status)) && Number(status) >= 500);
      if (!canFallback) throw err;
    }
  }
  throw lastErr || new Error('Direct sale endpoint not found.');
}

export async function previewWholesaleDirectSale(client, payload) {
  return postDirectSale(client, [
    '/sales/direct-sale/wholesale/preview',
    '/orders/direct-sale/wholesale/preview',
  ], withDirectSalePaymentMethod(payload));
}

export async function confirmWholesaleDirectSale(client, payload) {
  return postDirectSaleWithRetry(client, [
    '/sales/direct-sale/wholesale/confirm',
    '/orders/direct-sale/wholesale/confirm',
  ], withDirectSalePaymentMethod(payload));
}

export async function confirmRetailDirectSale(client, payload) {
  return postDirectSaleWithRetry(client, [
    '/sales/direct-sale/retail/confirm',
    '/orders/direct-sale/retail/confirm',
  ], withDirectSalePaymentMethod(payload));
}

export async function createWholesalerForDirectSale(client, payload) {
  return postDirectSale(
    client,
    ['/admin/wholesalers', '/sales/wholesalers'],
    payload,
    { timeout: 90000 },
  );
}
