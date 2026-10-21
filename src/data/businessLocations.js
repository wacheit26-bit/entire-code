/** Canonical city values stored in the API (business / delivery address). */
export const DEFAULT_BUSINESS_LOCATIONS = ['Bamenda', 'Yaounde', 'Douala'];
export const BUSINESS_LOCATIONS = [...DEFAULT_BUSINESS_LOCATIONS];

export const BUSINESS_LOCATION_LABELS = {
  Bamenda: 'Bamenda',
  Yaounde: 'Yaounde',
  Douala: 'Douala',
};

export function normalizeBusinessLocations(list) {
  const values = Array.isArray(list) ? list : [];
  const normalized = [...new Set(values.map((v) => String(v || '').trim()).filter(Boolean))];
  return normalized.length ? normalized : [...DEFAULT_BUSINESS_LOCATIONS];
}

/**
 * Map legacy free-text addresses to one of BUSINESS_LOCATIONS when possible.
 * @param {unknown} raw
 * @returns {string} One of BUSINESS_LOCATIONS or '' if unknown / empty.
 */
export function coerceBusinessLocation(raw, validLocations = BUSINESS_LOCATIONS) {
  const options = normalizeBusinessLocations(validLocations);
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (options.includes(s)) return s;
  const lower = s.toLowerCase();
  const match = options.find((city) => lower.includes(String(city).toLowerCase()));
  if (match) return match;
  return '';
}

export function isBusinessLocation(value, validLocations = BUSINESS_LOCATIONS) {
  const options = normalizeBusinessLocations(validLocations);
  return options.includes(String(value ?? '').trim());
}

/**
 * Accept-order APIs often validate delivery strings (min length / free text).
 * Keep the city from the dropdown but send a conventional line the backend accepts.
 * @param {string} city — one of BUSINESS_LOCATIONS or legacy text
 */
export function deliveryAddressPayloadForOrderAccept(city, validLocations = BUSINESS_LOCATIONS) {
  const options = normalizeBusinessLocations(validLocations);
  const c = String(city ?? '').trim();
  if (!c) return '';
  if (options.includes(c)) return `${c}, Cameroon`;
  return c;
}
