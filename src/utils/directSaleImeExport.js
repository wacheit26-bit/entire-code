function safeFileBase(name) {
  return String(name || 'export')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'export';
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/**
 * Download CSV of IME codes for a pending wholesale direct sale.
 */
export function downloadDirectSaleImeList({
  customerName,
  buyerName,
  productName,
  manifest = [],
  fileNameBase,
}) {
  const rows = Array.isArray(manifest) ? manifest : [];
  const headers = ['IME', 'Product', 'Brand', 'Capacity', 'Color', 'Batch', 'Status'];
  const body = rows.map((row) => [
    row.ime || '',
    row.productName || productName || '',
    row.brand || '',
    row.capacity || '',
    row.color || '',
    row.bulkBatchCode || '',
    'sold_out',
  ]);

  const lines = [
    '# Direct vendor sale — IME list (pending acceptance)',
    `# Customer: ${customerName || '—'}`,
    `# Vendor: ${buyerName || '—'}`,
    `# Product: ${productName || '—'}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
    headers.map(csvCell).join(','),
    ...body.map((line) => line.map(csvCell).join(',')),
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileBase(fileNameBase || `direct-sale-imes-${customerName}`)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
