function capitalizeWord(word) {
  const token = String(word ?? '');
  if (!token) return token;
  if (/^[^a-z]*[A-Z][A-Z0-9-]*$/.test(token)) return token;
  const lower = token.toLowerCase();
  return lower.replace(/[a-z]/, (letter) => letter.toUpperCase());
}

export function formatTitleCase(value, fallback = '') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw
    .split(/\s+/)
    .map((part) => capitalizeWord(part))
    .join(' ');
}

export function formatProductName(name) {
  return formatTitleCase(name, 'Product');
}
