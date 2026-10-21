import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function safeFileBase(name) {
  return String(name || 'export')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'export';
}

/**
 * @param {object} opts
 * @param {string} opts.fileNameBase - without .pdf
 * @param {string[]} opts.titleLines
 * @param {string[]} opts.columns - header row
 * @param {string[][]} opts.rows
 * @param {string[]} [opts.summaryLines]
 */
export function downloadOrdersAsPdf({ fileNameBase, titleLines, columns, rows, summaryLines = [] }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let y = 12;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  titleLines.forEach((line, i) => {
    doc.setFont(i === 0 ? 'helvetica' : 'helvetica', i === 0 ? 'bold' : 'normal');
    doc.text(String(line), 14, y);
    y += i === 0 ? 7 : 5;
  });
  doc.setFont('helvetica', 'normal');

  autoTable(doc, {
    startY: y + 4,
    head: [columns],
    body: rows.length ? rows : [columns.map((_, i) => (i === 0 ? 'No orders in this view' : '—'))],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 },
    tableLineColor: [203, 213, 225],
    tableLineWidth: 0.2,
  });

  const finalY = doc.lastAutoTable?.finalY ?? y + 20;
  let sy = finalY + 8;
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  summaryLines.forEach((line) => {
    doc.text(String(line), 14, sy);
    sy += 5;
  });
  doc.setTextColor(0, 0, 0);

  doc.save(`${safeFileBase(fileNameBase)}.pdf`);
}
