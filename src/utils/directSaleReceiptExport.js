import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatMoneyXaf } from './formatMoneyXaf';

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
 * Download sales receipt (CSV) for vendor direct sale.
 */
export function downloadDirectSaleReceipt({
  customerName,
  buyerName,
  purchaseLines = [],
  unitRows = [],
  grandTotal = 0,
  deliveryCity,
  note,
  fileNameBase,
}) {
  const lines = Array.isArray(purchaseLines) ? purchaseLines : [];
  const units = Array.isArray(unitRows) ? unitRows : [];
  const generated = new Date().toISOString();

  const summaryHeaders = ['Product', 'Brand', 'Qty', 'Unit price', 'Line total'];
  const summaryBody = lines.map((line) => [
    line.productName || '',
    line.brand || '',
    line.quantity || 0,
    line.unitPrice || 0,
    (Number(line.unitPrice) || 0) * (Number(line.quantity) || 0),
  ]);

  const unitHeaders = ['#', 'Product', 'Brand', 'Capacity', 'Color', 'IME', 'Unit price'];
  const unitBody = units.map((row, idx) => [
    idx + 1,
    row.productName || '',
    row.brand || '',
    row.capacity || '',
    row.color || '',
    row.ime || '—',
    row.unitPrice || 0,
  ]);

  const text = [
    'WACHE — DIRECT WHOLESALE SALE RECEIPT',
    `Generated: ${generated}`,
    `Customer: ${customerName || '—'}`,
    `Vendor account: ${buyerName || '—'}`,
    deliveryCity ? `Handover city: ${deliveryCity}` : '',
    note ? `Note: ${note}` : '',
    '',
    '--- LINE ITEMS ---',
    summaryHeaders.map(csvCell).join(','),
    ...summaryBody.map((line) => line.map(csvCell).join(',')),
    '',
    `SUBTOTAL (all lines): ${formatMoneyXaf(grandTotal)}`,
    `AMOUNT DUE: ${formatMoneyXaf(grandTotal)}`,
    '',
    '--- UNIT / IME DETAIL ---',
    unitHeaders.map(csvCell).join(','),
    ...unitBody.map((line) => line.map(csvCell).join(',')),
  ]
    .filter(Boolean)
    .join('\r\n');

  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileBase(fileNameBase || `direct-sale-receipt-${customerName}`)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Download vendor order receipt as PDF (includes IME rows when assigned). */
export function downloadVendorOrderReceiptPdf(payload) {
  if (!payload || typeof window === 'undefined') return;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Wache Electronics — Vendor sale receipt', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  [
    `Customer: ${payload.customerName || '—'}`,
    payload.buyerName ? `Vendor account: ${payload.buyerName}` : '',
    payload.shopName ? `Shop: ${payload.shopName}` : '',
    `Final price: ${formatMoneyXaf(payload.grandTotal || 0)}`,
    payload.orderRef ? `Ref: ${payload.orderRef}` : '',
  ]
    .filter(Boolean)
    .forEach((line) => {
      doc.text(line, 14, y);
      y += 5;
    });

  const units = Array.isArray(payload.unitRows) ? payload.unitRows : [];
  autoTable(doc, {
    startY: y + 4,
    head: [['#', 'Product', 'Brand', 'Capacity', 'Color', 'IME']],
    body: units.length
      ? units.map((row, idx) => [
          row.rowNumber ?? idx + 1,
          row.productName || '—',
          row.brand || '—',
          row.capacity || '—',
          row.color || '—',
          row.ime || '—',
        ])
      : [['—', 'No unit rows', '—', '—', '—', '—']],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 23, 42] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${safeFileBase(payload.fileNameBase || `vendor-order-${payload.orderRef || 'receipt'}`)}.pdf`);
}
