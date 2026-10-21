import { axiosPrivate } from './axios';

/** GET /cart — returns { items, summary, deliveryInfo, ... } */
export async function fetchServerCartSummary() {
  const res = await axiosPrivate.get('/cart');
  return res.data?.data ?? res.data;
}

export async function postCartItem(body) {
  const res = await axiosPrivate.post('/cart/items', body);
  return res.data?.data ?? res.data;
}

export async function putCartItemQty(lineKey, quantity) {
  const res = await axiosPrivate.put('/cart/items', { lineKey, quantity });
  return res.data?.data ?? res.data;
}

export async function deleteCartItemLine(lineKey) {
  const res = await axiosPrivate.delete('/cart/items', { data: { lineKey } });
  return res.data?.data ?? res.data;
}

export async function clearServerCart() {
  await axiosPrivate.delete('/cart');
}
