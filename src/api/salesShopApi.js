function unwrapData(body) {
  if (body?.data != null) return body.data;
  return body;
}

export async function fetchMyAssignedShops(client) {
  const res = await client.get('/sales/shops');
  const body = res.data;
  const data = unwrapData(body);
  return Array.isArray(data) ? data : [];
}

export async function fetchMyShopDetail(client, shopId) {
  const id = encodeURIComponent(String(shopId));
  const res = await client.get(`/sales/shops/${id}`);
  return unwrapData(res.data);
}

export async function fetchMyShopProducts(client, shopId) {
  const id = encodeURIComponent(String(shopId));
  const res = await client.get(`/sales/shops/${id}/products`);
  const body = unwrapData(res.data);
  return {
    shop: body?.shop ?? null,
    products: Array.isArray(body?.products) ? body.products : [],
    count: Number(body?.count) || 0,
    totalStock: Number(body?.totalStock) || 0,
  };
}

export async function fetchMyShopIncoming(client, shopId) {
  const id = encodeURIComponent(String(shopId));
  const res = await client.get(`/sales/shops/${id}/incoming`);
  const body = unwrapData(res.data);
  return {
    shop: body?.shop ?? null,
    products: Array.isArray(body?.products) ? body.products : [],
    batches: Array.isArray(body?.batches) ? body.batches : [],
    count: Number(body?.count) || 0,
  };
}

export async function receiveMyShopStock(client, shopId, payload) {
  const id = encodeURIComponent(String(shopId));
  const res = await client.post(`/sales/shops/${id}/receive-stock`, payload);
  const body = res.data;
  return { message: body?.message, ...unwrapData(body) };
}

export async function fetchGeneralInventoryWarehouses(client) {
  const res = await client.get('/sales/general-inventory/warehouses');
  const body = unwrapData(res.data);
  return Array.isArray(body) ? body : [];
}

async function fetchAllGeneralInventoryProductsLegacy(client) {
  const warehouses = await fetchGeneralInventoryWarehouses(client);
  if (!warehouses.length) {
    return { products: [], count: 0, totalStock: 0 };
  }

  const chunks = await Promise.all(
    warehouses.map(async (wh) => {
      const id = wh?._id ?? wh?.id;
      if (!id) return [];
      try {
        const data = await fetchGeneralInventoryProducts(client, id);
        return Array.isArray(data.products) ? data.products : [];
      } catch {
        return [];
      }
    }),
  );

  const products = chunks.flat();
  const totalStock = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
  return {
    products,
    count: products.length,
    totalStock,
  };
}

export async function fetchAllGeneralInventoryProducts(client) {
  try {
    const res = await client.get('/sales/general-inventory/products');
    const body = unwrapData(res.data);
    return {
      products: Array.isArray(body?.products) ? body.products : [],
      count: Number(body?.count) || 0,
      totalStock: Number(body?.totalStock) || 0,
    };
  } catch (e) {
    const status = e?.response?.status;
    if (status === 404 || status === 405) {
      return fetchAllGeneralInventoryProductsLegacy(client);
    }
    throw e;
  }
}

export async function fetchGeneralInventoryProducts(client, warehouseId) {
  const id = encodeURIComponent(String(warehouseId));
  const res = await client.get(`/sales/general-inventory/warehouses/${id}/products`);
  const body = unwrapData(res.data);
  return {
    warehouse: body?.warehouse ?? null,
    products: Array.isArray(body?.products) ? body.products : [],
    count: Number(body?.count) || 0,
    totalStock: Number(body?.totalStock) || 0,
  };
}

export async function submitGeneralInventoryRequest(client, payload) {
  const res = await client.post('/sales/general-inventory/requests', payload);
  return unwrapData(res.data);
}

/** IME / serial lookup — same data as admin inventory search, via salesperson API. */
export async function lookupInventoryByIme(client, ime) {
  const q = String(ime || '').trim();
  if (!q) throw new Error('Enter an IME code to search.');
  const res = await client.get('/sales/inventory/ime-lookup', { params: { ime: q } });
  const body = res.data;
  if (body?.success === false) {
    throw new Error(body.message || 'IME lookup failed.');
  }
  return body?.data ?? body;
}

export async function fetchVendorOrderFulfillmentPreview(client, orderId) {
  const id = encodeURIComponent(String(orderId));
  const res = await client.get(`/sales/orders/${id}/vendor-fulfillment`);
  return unwrapData(res.data);
}
