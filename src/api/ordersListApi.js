import axiosPublic from './axios';

function normalizeOrdersList(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

/**
 * GET /orders — uses axiosPublic for now; swap to axiosPrivate when routes are protected.
 */
export async function fetchOrdersPublic(params = {}) {
  const res = await axiosPublic.get('/orders', {
    params: { page: 1, limit: 100, ...params },
  });
  return normalizeOrdersList(res.data);
}

export function filterPendingOffers(orders) {
  return orders.filter(
    (o) =>
      String(o.orderType || '').toLowerCase() === 'offer' &&
      String(o.status || '').toLowerCase() === 'pending',
  );
}

/**
 * Pending offer orders for admin. Server may support ?orderType=offer&status=pending;
 * we always apply a client-side filter so results stay correct either way.
 */
export async function fetchPendingOfferOrdersPublic() {
  const rows = await fetchOrdersPublic({
    orderType: 'offer',
    status: 'pending',
    limit: 500,
    page: 1,
  });
  return filterPendingOffers(rows);
}

export async function fetchPendingOfferOrders(client) {
  const res = await client.get('/orders', {
    params: {
      orderType: 'offer',
      status: 'pending',
      limit: 500,
      page: 1,
    },
  });
  return filterPendingOffers(normalizeOrdersList(res.data));
}

export function filterOfferOrders(orders) {
  return orders.filter((o) => String(o.orderType || '').toLowerCase() === 'offer');
}

export async function fetchOfferOrders(client) {
  const res = await client.get('/orders', {
    params: {
      orderType: 'offer',
      limit: 500,
      page: 1,
    },
  });
  return filterOfferOrders(normalizeOrdersList(res.data));
}

export async function patchOrderAccept(client, orderId, payload = {}) {
  const safe = encodeURIComponent(String(orderId));
  const res = await client.patch(`/orders/${safe}/accept`, payload);
  return res.data?.data ?? res.data;
}

export async function patchOrderReject(client, orderId, payload = {}) {
  const safe = encodeURIComponent(String(orderId));
  const res = await client.patch(`/orders/${safe}/reject`, payload);
  return res.data?.data ?? res.data;
}

export async function deleteOrder(client, orderId) {
  const safe = encodeURIComponent(String(orderId));
  const res = await client.delete(`/orders/${safe}`);
  return res.data?.data ?? res.data;
}

export async function patchOrderDelivery(client, orderId, payload = {}) {
  const safe = encodeURIComponent(String(orderId));
  const res = await client.patch(`/orders/${safe}/delivery`, payload);
  return res.data?.data ?? res.data;
}

export async function patchOrderReceipt(client, orderId, payload = {}) {
  const safe = encodeURIComponent(String(orderId));
  const res = await client.patch(`/orders/${safe}/receipt`, payload);
  const body = res.data;
  if (body && typeof body === 'object' && body.success === false) {
    const err = new Error(String(body.message || 'Failed to update receipt'));
    err.response = { data: body };
    throw err;
  }
  return body?.data ?? body;
}

export async function fetchPendingDeliveryOrders(client, params = {}) {
  const res = await client.get('/orders/delivery/pending', {
    params: { page: 1, limit: 100, ...params },
  });
  return normalizeOrdersList(res.data);
}
