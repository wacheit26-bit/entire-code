function unwrapWarehousePayload(body) {
  if (!body || typeof body !== 'object') {
    return { mainWarehouses: [], main: null, subWarehouses: [] };
  }
  const data = body.data && typeof body.data === 'object' ? body.data : body;
  let mainWarehouses = Array.isArray(data.mainWarehouses)
    ? data.mainWarehouses
    : data.main
      ? [data.main]
      : [];
  let subWarehouses = Array.isArray(data.subWarehouses) ? data.subWarehouses : [];

  // Legacy/alternate shapes from older deployments
  if (!mainWarehouses.length && Array.isArray(data.warehouses)) {
    mainWarehouses = data.warehouses.filter((w) => String(w?.type || '').toLowerCase() === 'main');
    if (!subWarehouses.length) {
      subWarehouses = data.warehouses.filter((w) => String(w?.type || '').toLowerCase() === 'sub');
    }
  }

  return {
    mainWarehouses,
    main: data.main ?? mainWarehouses[0] ?? null,
    subWarehouses,
  };
}

export function subsForMainWarehouse(subWarehouses, mainId) {
  const key = String(mainId || '').trim();
  if (!key) return [];
  return (subWarehouses || []).filter((sub) => {
    const parent = sub?.parentWarehouse;
    const parentId =
      parent && typeof parent === 'object'
        ? String(parent._id ?? parent.id ?? '')
        : String(parent ?? '');
    return parentId === key;
  });
}

export function warehouseId(w) {
  if (w == null) return '';
  if (typeof w === 'string' || typeof w === 'number') return String(w).trim();
  const raw = w._id ?? w.id;
  if (raw == null) return '';
  if (typeof raw === 'object') {
    if (raw.$oid) return String(raw.$oid).trim();
    if (typeof raw.toString === 'function') {
      const s = String(raw).trim();
      if (s && s !== '[object Object]') return s;
    }
    return '';
  }
  return String(raw).trim();
}

/** Keep a valid main selection when warehouse options load or change. */
export function pickDefaultMainId(mainWarehouses, currentId = '') {
  const current = String(currentId || '').trim();
  if (current && mainWarehouses.some((m) => warehouseId(m) === current)) return current;
  for (const m of mainWarehouses) {
    const id = warehouseId(m);
    if (id) return id;
  }
  return '';
}

export async function fetchWarehouses(client) {
  const res = await client.get('/admin/warehouses');
  return unwrapWarehousePayload(res.data);
}

export async function createMainWarehouse(client, payload) {
  const res = await client.post('/admin/warehouses/main', payload);
  return res.data?.data ?? res.data;
}

export async function createSubWarehouse(client, payload) {
  const res = await client.post('/admin/warehouses/sub', payload);
  return res.data?.data ?? res.data;
}

export async function updateWarehouse(client, warehouseId, payload) {
  const id = encodeURIComponent(String(warehouseId));
  const res = await client.patch(`/admin/warehouses/${id}`, payload);
  return res.data?.data ?? res.data;
}

export async function fetchWarehouseDeletePreview(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  if (!id) throw new Error('Missing warehouse id');
  const res = await client.get(`/admin/warehouses/${id}/delete-preview`);
  return res.data?.data ?? res.data;
}

export async function deleteWarehouse(client, warehouseId, { reassignToWarehouseId } = {}) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  if (!id) throw new Error('Missing warehouse id');
  const body = {};
  if (reassignToWarehouseId) {
    body.reassignToWarehouseId = String(reassignToWarehouseId).trim();
  }
  const res = await client.delete(`/admin/warehouses/${id}`, { data: body });
  return res.data;
}

/** @deprecated use deleteWarehouse */
export async function deactivateSubWarehouse(client, warehouseId, options = {}) {
  return deleteWarehouse(client, warehouseId, options);
}

export async function fetchWarehouseProducts(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  if (!id) throw new Error('Missing warehouse id');
  const res = await client.get(`/admin/warehouses/${id}/products`);
  const body = res.data?.data ?? res.data;
  return {
    warehouse: body?.warehouse ?? null,
    products: Array.isArray(body?.products) ? body.products : [],
    count: Number(body?.count) || 0,
    totalProducts: Number(body?.totalProducts) || 0,
    totalStock: Number(body?.totalStock) || 0,
  };
}

export async function markProductArrived(client, productId) {
  const id = encodeURIComponent(String(productId));
  const res = await client.patch(`/products/${id}/arrive`, {});
  return res.data?.data ?? res.data;
}
