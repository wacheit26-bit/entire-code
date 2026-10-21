import { axiosPublic } from './axios';

export const BUSINESS_CITIES_UPDATED_EVENT = 'wache:business-cities-updated';

function normalizeCitiesResponse(body) {
  if (Array.isArray(body?.cities)) return body.cities;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function normalizeCityList(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((c) => String(c || '').trim()).filter(Boolean))];
}

export async function fetchBusinessCities(client = axiosPublic) {
  const usingPublicClient = client === axiosPublic;
  const endpoints = usingPublicClient
    ? ['/users/business-cities']
    : ['/users/business-cities', '/admin/business-cities'];

  let lastErr = null;
  for (const endpoint of endpoints) {
    try {
      const res = await client.get(endpoint);
      return normalizeCityList(normalizeCitiesResponse(res.data));
    } catch (err) {
      lastErr = err;
      const status = Number(err?.response?.status || 0);
      const canTryNext = status === 401 || status === 403 || status === 404 || status === 405;
      if (!canTryNext) throw err;
    }
  }
  throw lastErr || new Error('Could not load business cities.');
}

export async function addBusinessCity(client, name) {
  const payload = { name: String(name || '').trim() };
  const res = await client.post('/admin/business-cities', payload);
  return normalizeCityList(normalizeCitiesResponse(res.data));
}

function cityRouteKey(name) {
  return encodeURIComponent(String(name || '').trim());
}

export async function updateBusinessCity(client, currentName, newName) {
  const key = cityRouteKey(currentName);
  const res = await client.patch(`/admin/business-cities/${key}`, {
    name: String(newName || '').trim(),
  });
  return normalizeCityList(normalizeCitiesResponse(res.data));
}

export async function deleteBusinessCity(client, name) {
  const key = cityRouteKey(name);
  const res = await client.delete(`/admin/business-cities/${key}`);
  return normalizeCityList(normalizeCitiesResponse(res.data));
}

export function emitBusinessCitiesUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BUSINESS_CITIES_UPDATED_EVENT));
}
