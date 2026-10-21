import { isNetworkOrTimeoutError, INTERNET_CONNECTION_RETRY_MESSAGE } from './apiBaseUrl';

function isTransientSaleErrorMessage(text) {
  const msg = String(text || '').toLowerCase();
  return (
    msg.includes('transaction number')
    || msg.includes('in-progress transactions')
    || msg.includes('txnretrycounter')
    || msg.includes('transienttransactionerror')
    || msg.includes('write conflict')
    || msg.includes('writeconflict')
    || /session\s+[0-9a-f-]{36}/i.test(msg)
  );
}

export function isRequestTimeoutError(err) {
  return isNetworkOrTimeoutError(err);
}

/**
 * Show a clear message when a sale fails — hide raw database errors from staff.
 */
export function friendlySaleErrorMessage(raw, fallback = 'Could not save this sale. Please try again.') {
  const text = String(
    raw?.response?.data?.message ||
      raw?.response?.data?.error ||
      raw?.message ||
      raw ||
      '',
  ).trim();

  if (!text) return fallback;

  if (isTransientSaleErrorMessage(text)) {
    return 'The sale could not be saved right now because of a brief connection issue. Wait a moment and tap Confirm again.';
  }

  if (/e11000/i.test(text) && /ime/i.test(text)) {
    return 'This IME was already sold. Refresh the page, pick a different unit, and try again.';
  }

  if (/insufficient stock|not in your shop inventory|select exactly \d+ ime/i.test(text)) {
    return text;
  }

  if (/network|timeout|failed to fetch|econnreset/i.test(text)) {
    return INTERNET_CONNECTION_RETRY_MESSAGE;
  }

  if (/transaction|mongodb|session\s+[0-9a-f-]{36}/i.test(text)) {
    return 'The sale could not be saved right now because of a brief connection issue. Wait a moment and tap Confirm again.';
  }

  return text;
}

export function shouldRetrySaleRequest(err) {
  const status = Number(err?.response?.status);
  if (status === 503 || status === 502 || status === 504) return true;
  if (status >= 500) return true;
  const msg = String(err?.response?.data?.message || err?.message || '');
  return isTransientSaleErrorMessage(msg);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry confirm-sale requests once when the server hits a transient database error.
 */
export async function postDirectSaleWithRetry(client, paths, payload) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let innerErr = null;
      for (const path of paths) {
        try {
          const res = await client.post(path, payload);
          const body = res.data;
          if (body?.data != null) return body.data;
          return body;
        } catch (err) {
          innerErr = err;
          const status = err?.response?.status;
          const canFallback =
            status === 404 ||
            status === 405 ||
            status === 401 ||
            status === 403 ||
            (Number.isFinite(Number(status)) && Number(status) >= 500);
          if (!canFallback) throw err;
        }
      }
      throw innerErr || new Error('Direct sale endpoint not found.');
    } catch (err) {
      lastErr = err;
      if (attempt === 0 && shouldRetrySaleRequest(err)) {
        await delay(600);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('Direct sale endpoint not found.');
}
