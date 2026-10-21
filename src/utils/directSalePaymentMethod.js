/** Keep payment normalization aligned with server transaction method keys. */
export function normalizeDirectSalePaymentMethod(raw, methods = null) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return '';

  const rows = Array.isArray(methods) ? methods : null;
  if (rows?.length) {
    const allowed = new Set(rows.map((row) => String(row.value || '').trim().toLowerCase()));
    if (allowed.has(value)) return value;

    const aliases = {
      'mobile money': 'momo',
      bank_transfer: 'bank transfer',
      'bank-transfer': 'bank transfer',
      others: 'other',
      orthers: 'other',
      'other payment': 'other',
      'other payments': 'other',
    };
    const aliasTarget = aliases[value];
    if (aliasTarget && allowed.has(aliasTarget)) return aliasTarget;

    if (value.startsWith('other') && allowed.has('other')) return 'other';

    for (const row of rows) {
      const nameKey = String(row.name || '')
        .trim()
        .toLowerCase();
      if (nameKey === value) return String(row.value || '').trim().toLowerCase();
    }
    return '';
  }

  if (value === 'cash') return 'cash';
  if (value === 'momo' || value === 'mobile money') return 'momo';
  if (value === 'bank transfer' || value === 'bank_transfer' || value === 'bank-transfer') {
    return 'bank transfer';
  }
  if (
    value === 'other' ||
    value === 'others' ||
    value === 'orthers' ||
    value === 'other payment' ||
    value === 'other payments' ||
    value.startsWith('other')
  ) {
    return 'other';
  }
  return '';
}

export function withDirectSalePaymentMethod(payload, methods = null) {
  if (!payload || typeof payload !== 'object') return payload;
  const paymentMethod = normalizeDirectSalePaymentMethod(payload.paymentMethod, methods);
  if (!paymentMethod) return payload;
  return { ...payload, paymentMethod };
}
