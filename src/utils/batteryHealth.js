export function isValidBatteryHealth(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}

export function formatBatteryHealthLabel(value) {
  if (!isValidBatteryHealth(value)) return null;
  return `${Math.round(Number(value))}%`;
}

export function formatInventoryBatteryHealth(row) {
  const values = new Set();
  const locations = Array.isArray(row?.locations) ? row.locations : [];
  if (locations.length) {
    for (const loc of locations) {
      const label = formatBatteryHealthLabel(loc?.product?.batteryHealth);
      if (label) values.add(label);
    }
  } else {
    const label = formatBatteryHealthLabel(row?.batteryHealth);
    if (label) values.add(label);
  }
  if (!values.size) return null;
  return [...values].join(' · ');
}

export function parseBatteryHealthInput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { value: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { error: 'Battery health must be a number from 0 to 100.' };
  }
  return { value: Math.round(n) };
}
