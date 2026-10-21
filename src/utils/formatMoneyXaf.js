/** Format a number with comma thousands separators (e.g. 1,250,000). */
export function formatNumberWithCommas(value, { maximumFractionDigits = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Parse numeric input that may include comma separators. Returns a number or '' if empty. */
export function parseFormattedNumber(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const cleaned = raw.replace(/,/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return '';
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : '';
}

/** Central African CFA franc (XAF) — comma-separated for readability. */
export function formatMoneyXaf(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return 'XAF 0';
  return `XAF ${formatNumberWithCommas(Math.round(n))}`;
}
