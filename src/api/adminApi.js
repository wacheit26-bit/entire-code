function normalizeUsersResponse(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.users)) return body.users;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function dedupeUsersById(users) {
  const map = new Map();
  for (const user of Array.isArray(users) ? users : []) {
    const id = String(user?._id ?? user?.id ?? '').trim();
    if (!id) continue;
    map.set(id, user);
  }
  return [...map.values()];
}

function isWholesalerUser(u) {
  return String(u?.role || '').toLowerCase() === 'wholesaler';
}

function normalizeInventoryProductsResponse(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.products)) return body.products;
  return [];
}

/** Admin inventory tab — all products regardless of shop listing rules. */
export async function fetchAdminInventoryProducts(client, { limit = 500 } = {}) {
  const res = await client.get('/admin/inventory/products', {
    params: { limit },
    timeout: 45000,
  });
  return normalizeInventoryProductsResponse(res.data);
}

export async function fetchWholesalers(client, params = {}) {
  const res = await client.get('/users/wholesalers', { params });
  return normalizeUsersResponse(res.data).filter(isWholesalerUser);
}

/** Prefix search for direct-sale wholesaler picker (role wholesaler only, case-insensitive). */
export async function searchWholesalers(client, query, limit = 40) {
  const q = String(query || '').trim();
  if (!q) return [];
  const res = await client.get('/users/wholesalers', {
    params: {
      search: q,
      limit,
      prefix: 'true',
      forDirectSale: 'true',
    },
  });
  return normalizeUsersResponse(res.data).filter(isWholesalerUser);
}

export async function fetchAllPlatformAccounts(client, params = {}) {
  const queryParams = { limit: 1000, page: 1, ...params };

  try {
    const res = await client.get('/users/all-staff', { params: queryParams });
    const users = normalizeUsersResponse(res.data);
    const reportedTotal = Number(
      res.data?.counts?.total ?? res.data?.pagination?.total ?? users.length,
    );
    if (users.length > 0 || (res.data?.success !== false && reportedTotal === 0)) {
      return users;
    }
  } catch {
    /* fall back below */
  }

  try {
    const [whRes, smRes] = await Promise.all([
      client.get('/users/wholesalers', { params: queryParams }),
      client.get('/users/salesmen', { params: queryParams }),
    ]);
    return dedupeUsersById([
      ...normalizeUsersResponse(whRes.data),
      ...normalizeUsersResponse(smRes.data),
    ]);
  } catch {
    return [];
  }
}

export async function setUserPasswordByAdmin(client, userId, password) {
  const id = encodeURIComponent(String(userId));
  const res = await client.patch(`/users/${id}/password`, { password });
  return res.data;
}

export async function createWholesalerAccount(client, body) {
  const res = await client.post('/admin/wholesalers', body, { timeout: 90000 });
  return res.data;
}

export async function activateUser(client, userId) {
  const id = encodeURIComponent(String(userId));
  const res = await client.patch(`/users/${id}/activate`, {});
  return res.data;
}

export async function deletePlatformAccount(client, userId) {
  const id = encodeURIComponent(String(userId));
  const res = await client.delete(`/users/${id}`);
  return res.data;
}

export async function updateUserStatus(client, userId, accountStatus) {
  const id = encodeURIComponent(String(userId));
  const res = await client.patch(`/users/${id}/status`, { accountStatus });
  return res.data;
}

export async function updatePlatformAccount(client, userId, body) {
  const id = encodeURIComponent(String(userId));
  const res = await client.patch(`/users/${id}`, body);
  const data = res.data?.data ?? res.data;
  return data;
}

function normalizeOrdersListBody(body) {
  if (body == null) return [];
  if (typeof body !== 'object') return [];
  if (body.success === false) {
    const err = new Error(String(body.message || body.error || 'Failed to load orders'));
    err.response = { data: body, status: 400 };
    throw err;
  }
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.orders)) return body.orders;
  if (Array.isArray(body.results)) return body.results;
  if (Array.isArray(body)) return body;
  return [];
}

export async function fetchOrdersList(client, params = {}) {
  const res = await client.get('/orders', { params: { limit: 500, page: 1, ...params } });
  return normalizeOrdersListBody(res.data);
}

export async function fetchUsersList(client, params = {}) {
  const res = await client.get('/users', { params });
  return normalizeUsersResponse(res.data);
}

export async function updateSalesmanShops(client, userId, shopIds) {
  const id = encodeURIComponent(String(userId));
  const res = await client.patch(`/users/${id}/shops`, { shopIds });
  return res.data?.data ?? res.data;
}

export function formatAssignedShopNames(user) {
  const shops = Array.isArray(user?.assignedShops) ? user.assignedShops : [];
  if (!shops.length) return '—';
  return shops
    .map((s) => (typeof s === 'object' && s?.name ? `${s.name}${s.city ? ` (${s.city})` : ''}` : ''))
    .filter(Boolean)
    .join(', ');
}

export async function fetchSalespeopleByShop(client, shopId, params = {}) {
  const id = String(shopId || '').trim();
  if (!id) return [];

  try {
    const res = await client.get('/users/salesmen', {
      params: {
        shopId: id,
        status: 'active',
        limit: 200,
        page: 1,
        ...params,
      },
    });
    return normalizeUsersResponse(res.data);
  } catch {
    return [];
  }
}

export async function fetchStaffList(client) {
  const isStaffRole = (u) => {
    const role = String(u?.role || '').toLowerCase().trim();
    return role === 'salesman' || role === 'salesperson' || role === 'sales' || role === 'admin';
  };

  try {
    const res = await client.get('/users/all-staff', { params: { limit: 1000, page: 1 } });
    const users = normalizeUsersResponse(res.data);
    return users.filter(isStaffRole);
  } catch {
    /* fallback below */
  }

  return fetchSalespeopleList(client);
}

export async function fetchSalespeopleList(client) {
  const isSalesRole = (u) => {
    const role = String(u?.role || '').toLowerCase().trim();
    return role === 'salesman' || role === 'salesperson' || role === 'sales';
  };

  try {
    const res = await client.get('/users/salesmen');
    const users = normalizeUsersResponse(res.data);
    return users.filter(isSalesRole);
  } catch {
    /* fallback to alternate staff endpoints */
  }

  try {
    const res = await client.get('/users/all-staff', { params: { role: 'salesman' } });
    const users = normalizeUsersResponse(res.data);
    return users.filter(isSalesRole);
  } catch {
    /* fallback for older APIs */
  }

  const users = await fetchUsersList(client);
  return users.filter(isSalesRole);
}

export { deleteProductById } from './productsApi';

export async function fetchMonthlySalesReport(client, params = {}) {
  const res = await client.get('/admin/reports/monthly-sales', { params });
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'Failed to load monthly sales report.');
  }
  return body;
}

export async function fetchAdminDashboardStats(client, params = {}) {
  const res = await client.get('/admin/dashboard', { params });
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'Failed to load dashboard statistics.');
  }
  return body?.data ?? body;
}

export async function fetchSoldOutInventory(client, params = {}) {
  const res = await client.get('/admin/inventory/sold-out', { params });
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'Failed to load sold-out inventory.');
  }
  return {
    rows: Array.isArray(body?.data) ? body.data : [],
    total: Number(body?.total) || 0,
    count: Number(body?.count) || 0,
  };
}

export async function lookupInventoryByIme(client, ime) {
  const q = String(ime || '').trim();
  if (!q) throw new Error('Enter an IME code to search.');
  const res = await client.get('/admin/inventory/ime-lookup', { params: { ime: q } });
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'IME lookup failed.');
  }
  return body?.data ?? body;
}

export async function revokeSoldOutInventoryUnit(client, soldImeId, payload = {}) {
  const id = encodeURIComponent(String(soldImeId || '').trim());
  if (!id) throw new Error('Sold unit id is required.');
  const res = await client.patch(`/admin/inventory/sold-out/${id}/revoke`, payload);
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'Could not revoke sold unit.');
  }
  return body?.data ?? body;
}
