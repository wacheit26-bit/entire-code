import { axiosPublic } from './axios';

export const EXPENSE_CATEGORIES_UPDATED_EVENT = 'wache:expense-categories-updated';

function normalizeCategoriesResponse(body) {
  if (Array.isArray(body?.categories)) return body.categories;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function normalizeCategoryRows(list) {
  return (Array.isArray(list) ? list : [])
    .map((row) => {
      if (typeof row === 'string') {
        const name = String(row || '').trim();
        if (!name) return null;
        return { _id: name, name, value: name.toLowerCase() };
      }
      const name = String(row?.name || '').trim();
      const _id = String(row?._id || row?.id || '').trim();
      const value = String(row?.value || row?.normalizedName || name || '')
        .trim()
        .toLowerCase();
      if (!name || !_id) return null;
      return { _id, name, value };
    })
    .filter(Boolean);
}

export async function fetchExpenseCategories(client = axiosPublic) {
  const usingPublicClient = client === axiosPublic;
  const endpoints = usingPublicClient
    ? ['/users/expense-categories']
    : ['/users/expense-categories', '/admin/expense-categories', '/sales/expense-categories'];

  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const res = await client.get(endpoint);
      return normalizeCategoryRows(normalizeCategoriesResponse(res.data));
    } catch (err) {
      lastErr = err;
      const status = Number(err?.response?.status || 0);
      const canTryNext = status === 401 || status === 403 || status === 404 || status === 405;
      if (!canTryNext) throw err;
    }
  }
  throw lastErr || new Error('Could not load expense categories.');
}

export async function addExpenseCategory(client, name) {
  const payload = { name: String(name || '').trim() };
  const res = await client.post('/admin/expense-categories', payload);
  return normalizeCategoryRows(normalizeCategoriesResponse(res.data));
}

function categoryRouteKey(value) {
  return encodeURIComponent(String(value || '').trim().toLowerCase());
}

export async function updateExpenseCategory(client, currentValue, newName) {
  const key = categoryRouteKey(currentValue);
  const res = await client.patch(`/admin/expense-categories/${key}`, {
    name: String(newName || '').trim(),
  });
  return normalizeCategoryRows(normalizeCategoriesResponse(res.data));
}

export async function deleteExpenseCategory(client, value) {
  const key = categoryRouteKey(value);
  const res = await client.delete(`/admin/expense-categories/${key}`);
  return normalizeCategoryRows(normalizeCategoriesResponse(res.data));
}

export function emitExpenseCategoriesUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EXPENSE_CATEGORIES_UPDATED_EVENT));
}
