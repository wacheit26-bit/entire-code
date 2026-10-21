function normalizeExpensesResponse(body) {
  if (Array.isArray(body?.expenses)) return body.expenses;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

export async function fetchAllExpenses(client) {
  const res = await client.get('/admin/expenses');
  return normalizeExpensesResponse(res.data);
}

export async function createAdminExpense(client, payload) {
  const res = await client.post('/admin/expenses', payload);
  return res?.data?.expense ?? null;
}

export async function fetchShopExpenses(client, shopId) {
  const id = encodeURIComponent(String(shopId || '').trim());
  const res = await client.get(`/sales/shops/${id}/expenses`);
  return normalizeExpensesResponse(res.data);
}

export async function createShopExpense(client, shopId, payload) {
  const id = encodeURIComponent(String(shopId || '').trim());
  const res = await client.post(`/sales/shops/${id}/expenses`, payload);
  return res?.data?.expense ?? null;
}
