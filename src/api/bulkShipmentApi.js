function unwrapList(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

export async function fetchBulkShipments(client, { status } = {}) {
  const params = {};
  if (status) params.status = status;
  const res = await client.get('/admin/bulk-shipments', { params });
  return unwrapList(res.data);
}

export async function fetchBulkShipment(client, idOrCode) {
  const key = encodeURIComponent(String(idOrCode || '').trim());
  const res = await client.get(`/admin/bulk-shipments/${key}`);
  return res.data?.data ?? res.data;
}

/** Mark batch received at main (no shop yet) or delivered to assigned shop. */
export async function markBulkShipmentArrived(client, idOrCode) {
  const key = encodeURIComponent(String(idOrCode || '').trim());
  const res = await client.patch(`/admin/bulk-shipments/${key}/arrive`, {});
  const body = res.data;
  return {
    message: body?.message,
    data: body?.data ?? body,
    ...body?.data,
  };
}
