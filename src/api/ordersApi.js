/**
 * Safe JSON parse for POST /orders — empty bodies, HTML error pages, or invalid JSON
 * after HTTP 2xx would otherwise make axios reject even when the order was persisted.
 */
function safeParseOrdersResponse(data) {
  if (data == null || data === '') return {};
  if (typeof data === 'object') return data;
  const t = String(data).trim();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/**
 * Some APIs return HTTP 200 with { success: false } when the row was not persisted.
 * Throw so the client does not show success or emit "order created" incorrectly.
 */
function assertOrderCreatePayloadOk(data) {
  if (data == null || data === '') return;
  const root = typeof data === 'object' ? data : {};
  const inner = root?.data != null && typeof root.data === 'object' ? root.data : root;
  if (inner && typeof inner === 'object') {
    if (inner.success === false) {
      throw new Error(
        String(inner.message || inner.error || 'The order was not saved. Please try again or contact support.'),
      );
    }
  }
}

export async function postOrderRequest(client, body) {
  try {
    const res = await client.post('/orders', body, {
      transformResponse: [safeParseOrdersResponse],
      /** Avoid indefinite loading if the server never responds (axios default is no timeout). */
      timeout: 120_000,
    });
    const data = res?.data ?? {};
    assertOrderCreatePayloadOk(data);
    return data;
  } catch (err) {
    const status = err?.response?.status;
    if (typeof status === 'number' && status >= 200 && status < 300) {
      return {};
    }
    throw err;
  }
}
