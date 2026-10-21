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
 * Download a CSV of IME codes transferred to a shop.
 * @param {object} opts
 * @param {string} opts.shopName
 * @param {string} opts.warehouseName
 * @param {Array<{ ime: string, productName?: string, brand?: string, capacity?: string, color?: string, bulkBatchCode?: string|null }>} opts.manifest
 * @param {string} [opts.fileNameBase]
 */
export function downloadShopTransferImeList({ shopName, warehouseName, manifest = [], fileNameBase }) {
  const rows = Array.isArray(manifest) ? manifest : [];
  const headers = ['IME', 'Product', 'Brand', 'Capacity', 'Color', 'Batch'];
  const body = rows.map((row) => [
    row.ime || '',
    row.productName || '',
    row.brand || '',
    row.capacity || '',
    row.color || '',
    row.bulkBatchCode || '',
  ]);

  const lines = [
    `# Shop transfer IME list`,
    `# From: ${warehouseName || 'Warehouse'}`,
    `# To: ${shopName || 'Shop'}`,
    `# Generated: ${new Date().toISOString()}`,
    '',
    headers.map(csvCell).join(','),
    ...body.map((line) => line.map(csvCell).join(',')),
  ];

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileBase(fileNameBase || `shop-transfer-imes-${shopName}`)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
