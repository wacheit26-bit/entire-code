import { axiosPublic } from './axios';

export const TRANSACTION_METHODS_UPDATED_EVENT = 'wache:transaction-methods-updated';

function normalizeMethodsResponse(body) {
  if (Array.isArray(body?.methods)) return body.methods;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function normalizeMethodRows(list) {
  return (Array.isArray(list) ? list : [])
    .map((row) => {
      if (typeof row === 'string') {
        const value = String(row || '').trim().toLowerCase();
        if (!value) return null;
        return { name: row, value };
      }
      const name = String(row?.name || '').trim();
      const value = String(row?.value || row?.normalizedName || name || '')
        .trim()
        .toLowerCase();
      if (!name || !value) return null;
      return { name, value };
    })
    .filter(Boolean);
}

export async function fetchTransactionMethods(client = axiosPublic) {
  const usingPublicClient = client === axiosPublic;
  const endpoints = usingPublicClient
    ? ['/users/transaction-methods']
    : ['/users/transaction-methods', '/admin/transaction-methods'];

  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const res = await client.get(endpoint);
      return normalizeMethodRows(normalizeMethodsResponse(res.data));
    } catch (err) {
      lastErr = err;
      const status = Number(err?.response?.status || 0);
      const canTryNext = status === 401 || status === 403 || status === 404 || status === 405;
      if (!canTryNext) throw err;
    }
  }
  throw lastErr || new Error('Could not load transaction methods.');
}

export async function addTransactionMethod(client, name) {
  const payload = { name: String(name || '').trim() };
  const res = await client.post('/admin/transaction-methods', payload);
  return normalizeMethodRows(normalizeMethodsResponse(res.data));
}

function methodRouteKey(value) {
  return encodeURIComponent(String(value || '').trim().toLowerCase());
}

export async function updateTransactionMethod(client, currentValue, newName) {
  const key = methodRouteKey(currentValue);
  const res = await client.patch(`/admin/transaction-methods/${key}`, {
    name: String(newName || '').trim(),
  });
  return normalizeMethodRows(normalizeMethodsResponse(res.data));
}

export async function deleteTransactionMethod(client, value) {
  const key = methodRouteKey(value);
  const res = await client.delete(`/admin/transaction-methods/${key}`);
  return normalizeMethodRows(normalizeMethodsResponse(res.data));
}

export function emitTransactionMethodsUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TRANSACTION_METHODS_UPDATED_EVENT));
}
