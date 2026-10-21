function unwrapData(body) {
  return body?.data ?? body;
}

export async function fetchWarehousesDashboardOverview(client) {
  const res = await client.get('/admin/warehouses/overview');
  return unwrapData(res.data);
}

export async function fetchWarehouseHub(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const res = await client.get(`/admin/warehouses/${id}/hub`);
  return unwrapData(res.data);
}

export async function fetchWarehouseReadyToTransfer(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const res = await client.get(`/admin/warehouses/${id}/ready-to-transfer`);
  return unwrapData(res.data);
}

export async function fetchWarehouseIncoming(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const res = await client.get(`/admin/warehouses/${id}/incoming`);
  return unwrapData(res.data);
}

export async function lookupWarehouseByIme(client, warehouseId, ime) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const res = await client.get(`/admin/warehouses/${id}/lookup`, {
    params: { ime: String(ime || '').trim() },
  });
  return unwrapData(res.data);
}

export async function fetchStockRequests(client, warehouseId, { status } = {}) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const params = {};
  if (status) params.status = status;
  const res = await client.get(`/admin/warehouses/${id}/stock-requests`, { params });
  const body = res.data;
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

export async function createStockRequest(client, shopWarehouseId, payload) {
  const id = encodeURIComponent(String(shopWarehouseId || '').trim());
  const res = await client.post(`/admin/warehouses/${id}/stock-requests`, payload);
  return unwrapData(res.data);
}

export async function updateStockRequest(client, requestId, payload) {
  const key = encodeURIComponent(String(requestId || '').trim());
  const res = await client.patch(`/admin/stock-requests/${key}`, payload);
  return unwrapData(res.data);
}

export async function assignBulkShipmentDestination(client, batchKey, destinationSubWarehouse) {
  const key = encodeURIComponent(String(batchKey || '').trim());
  const res = await client.patch(`/admin/bulk-shipments/${key}/assign`, {
    destinationSubWarehouse,
  });
  return unwrapData(res.data);
}

/** Confirm travelling stock received at this warehouse (status → arrived, stays here). */
export async function receiveStockAtWarehouse(client, warehouseId, payload) {
  const id = encodeURIComponent(String(warehouseId || '').trim());
  const res = await client.post(`/admin/warehouses/${id}/receive-stock`, payload);
  const body = res.data;
  return { message: body?.message, ...unwrapData(body) };
}

export async function transferToShop(client, mainWarehouseId, payload) {
  const id = encodeURIComponent(String(mainWarehouseId || '').trim());
  const res = await client.post(`/admin/warehouses/${id}/transfer-to-shop`, payload);
  const body = res.data;
  return { message: body?.message, ...unwrapData(body) };
}

export async function transferToWarehouse(client, mainWarehouseId, payload) {
  const id = encodeURIComponent(String(mainWarehouseId || '').trim());
  const res = await client.post(`/admin/warehouses/${id}/transfer-to-warehouse`, payload);
  const body = res.data;
  return { message: body?.message, ...unwrapData(body) };
}
