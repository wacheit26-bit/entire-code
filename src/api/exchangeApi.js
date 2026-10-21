function normalizeRows(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

/** GET /admin/exchange/sales-by-month */
export async function fetchExchangeSalesByMonth(client, { month } = {}) {
  const params = {};
  if (month) params.month = month;
  const res = await client.get('/admin/exchange/sales-by-month', { params });
  return {
    month: res.data?.month || month || '',
    count: Number(res.data?.count) || 0,
    rows: normalizeRows(res.data),
  };
}

/** GET /admin/exchange/sales-by-phone-name */
export async function fetchExchangeSalesByPhoneName(client, { phoneName, month } = {}) {
  const params = { phoneName: String(phoneName || '').trim() };
  if (month) params.month = month;
  const res = await client.get('/admin/exchange/sales-by-phone-name', { params });
  return {
    phoneName: res.data?.phoneName || phoneName,
    month: res.data?.month || month || '',
    count: Number(res.data?.count) || 0,
    rows: normalizeRows(res.data),
  };
}

/** GET /admin/exchange/check-ime */
export async function checkExchangeIme(client, ime, filters = {}) {
  const params = { ime: String(ime || '').trim() };
  if (filters.phoneName) params.replacementPhoneName = String(filters.phoneName).trim();
  if (filters.replacementIme) params.replacementIme = String(filters.replacementIme).trim();
  const res = await client.get('/admin/exchange/check-ime', { params });
  return res.data?.data || null;
}

/** GET /admin/exchange/available-replacements */
export async function fetchAvailableReplacements(client, { excludeIme, phoneName, replacementIme } = {}) {
  const params = {};
  if (excludeIme) params.excludeIme = String(excludeIme).trim();
  if (phoneName) params.phoneName = String(phoneName).trim();
  if (replacementIme) params.ime = String(replacementIme).trim();
  const res = await client.get('/admin/exchange/available-replacements', { params });
  return {
    count: Number(res.data?.count) || 0,
    rows: normalizeRows(res.data),
  };
}

/** POST /admin/exchange/process-exchange */
export async function processExchange(client, payload) {
  const res = await client.post('/admin/exchange/process-exchange', payload);
  return res.data?.data || null;
}

export const EXCHANGE_CONDITION_OPTIONS = ['Normal', 'Faulty'];
