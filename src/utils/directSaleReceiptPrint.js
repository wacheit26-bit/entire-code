import { formatMoneyXaf } from './formatMoneyXaf';
import {
  isDirectOrder,
  orderAmount,
  orderId,
  orderProductName,
  orderDisplayCode,
  orderEffectiveQuantity,
  orderAssignedShopId,
  orderShopRef,
} from './orderDisplay';

function resolveReceiptShopName(order, shop) {
  const ds = order?.directSale && typeof order.directSale === 'object' ? order.directSale : {};
  const warehouseRef = ds.assignedWarehouseId;
  const populatedName =
    warehouseRef && typeof warehouseRef === 'object'
      ? String(warehouseRef.name || warehouseRef.label || '').trim()
      : '';
  return (
    String(ds.assignedWarehouseName || '').trim() ||
    populatedName ||
    orderShopRef(order).name ||
    String(shop?.name || '').trim()
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatReceiptDate(iso) {
  if (!iso) return new Date().toLocaleString('fr-CM');
  try {
    return new Date(iso).toLocaleString('fr-CM', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

function saleTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'retail') return 'Retail (in-shop)';
  if (t === 'wholesale') return 'Vendor (in-shop)';
  return 'Direct sale';
}

function paymentMethodLabel(method) {
  const v = String(method || '').trim().toLowerCase();
  if (v === 'momo') return 'MoMo';
  if (v === 'bank transfer') return 'Bank transfer';
  if (v === 'other' || v === 'others') return 'Others';
  return 'Cash';
}

function resolveReceiptLineTotal(order) {
  const qty = Math.max(1, orderEffectiveQuantity(order) || Number(order?.quantity) || 1);
  const receiptGrandTotal = Number(order?.directSale?.receiptGrandTotal);
  const storedTotal = Number(
    order?.finalPrice ?? order?.originalTotal ?? order?.totalAmount ?? order?.total ?? order?.amount,
  );
  const soldUnit = Number(order?.directSale?.soldUnitPrice ?? order?.productPrice);
  const fromUnits = Number.isFinite(soldUnit) && soldUnit > 0 ? soldUnit * qty : NaN;

  const hasReceipt =
    order?.directSale?.receiptGrandTotal != null && order?.directSale?.receiptGrandTotal !== '';
  const hasStored = Number.isFinite(storedTotal) && storedTotal >= 0;

  if (hasStored && hasReceipt && Number.isFinite(receiptGrandTotal)) {
    if (Math.abs(storedTotal - receiptGrandTotal) > 1) return storedTotal;
    return receiptGrandTotal;
  }
  if (hasStored) return storedTotal;
  if (hasReceipt && Number.isFinite(receiptGrandTotal) && receiptGrandTotal >= 0) {
    return receiptGrandTotal;
  }
  if (Number.isFinite(fromUnits) && fromUnits > 0) return fromUnits;
  return orderAmount(order);
}

/**
 * Build printable receipt payload from a completed direct-sale order.
 */
export function buildReceiptPayloadFromOrder(order, shop = null) {
  const ds = order?.directSale && typeof order.directSale === 'object' ? order.directSale : {};
  const batchReceiptLines = Array.isArray(ds.receiptLines) ? ds.receiptLines : null;

  if (batchReceiptLines?.length) {
    const purchaseLines = batchReceiptLines.map((line) => {
      const quantity = Math.max(1, Number(line.quantity) || 1);
      const unitPrice = Number(line.unitPrice) || 0;
      const lineTotal =
        Number(line.lineTotal) > 0 ? Number(line.lineTotal) : unitPrice * quantity;
      return {
        productName: line.productName || 'Product',
        brand: line.brand || '',
        quantity,
        unitPrice,
        lineTotal,
      };
    });

    const storedUnitRows = Array.isArray(ds.receiptUnitRows) ? ds.receiptUnitRows : [];
    let unitRows = storedUnitRows.map((row, idx) => ({
      rowNumber: idx + 1,
      productName: row.productName || orderProductName(order),
      brand: row.brand || '',
      capacity: row.capacity || '',
      color: row.color || '',
      ime: row.ime || '',
      unitPrice: Number(row.unitPrice) > 0 ? Number(row.unitPrice) : 0,
    }));

    if (!unitRows.length) {
      for (const line of purchaseLines) {
        for (let i = 0; i < line.quantity; i += 1) {
          unitRows.push({
            rowNumber: unitRows.length + 1,
            productName: line.productName,
            brand: line.brand || '',
            capacity: '',
            color: '',
            ime: '—',
            unitPrice: line.unitPrice,
          });
        }
      }
    }

    const userNotes = String(order?.userNotes || '');
    const customerMatch = userNotes.match(/Customer:\s*([^—\n]+)/i);
    const customerName =
      String(ds.customerName || '').trim() ||
      (customerMatch ? customerMatch[1].trim() : '') ||
      String(order?.businessName || order?.userId?.businessName || 'Customer').trim();

    const isRetail = /\[Direct sale\s*[—-]\s*in-Shop\s*[—-]\s*Retail\]/i.test(userNotes);
    const saleType =
      ds.type || (isRetail ? 'retail' : isDirectOrder(order) ? 'wholesale' : '');
    const paymentMethod = String(ds.paymentMethod || '').trim().toLowerCase() || 'cash';

    const handledBy = order?.handledBy;
    const handledById = String(
      (typeof handledBy === 'object' ? handledBy?._id ?? handledBy?.id : handledBy) ?? '',
    ).trim();
    const salespersonName =
      (typeof handledBy === 'object' ? String(handledBy?.name || '').trim() : '') ||
      String(order?.handledByName || order?.completedByName || '').trim();

    const grandTotal =
      Number(ds.receiptGrandTotal) > 0
        ? Number(ds.receiptGrandTotal)
        : purchaseLines.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0);

    const batchRef = String(ds.batchOrderRef || '').trim();
    const orderRef =
      batchRef ||
      (orderDisplayCode(order) !== '—' ? orderDisplayCode(order) : orderId(order).slice(-8) || '—');

    return {
      customerName,
      buyerName: order?.businessName || order?.userId?.businessName || '',
      shopName: resolveReceiptShopName(order, shop),
      assignedWarehouseId: orderAssignedShopId(order),
      handledById,
      salespersonName,
      saleType,
      paymentMethod,
      purchaseLines,
      unitRows,
      grandTotal,
      orderRef,
      soldAt: order?.handledAt || order?.createdAt || null,
    };
  }

  const trackedQty = orderEffectiveQuantity(order);
  const qty = Math.max(1, trackedQty || Number(order?.quantity) || 1);
  const lineTotal = resolveReceiptLineTotal(order);
  const soldUnit = Number(order?.directSale?.soldUnitPrice ?? order?.productPrice);
  const unitPrice =
    Number.isFinite(soldUnit) && soldUnit > 0
      ? soldUnit
      : qty > 0
        ? lineTotal / qty
        : 0;

  const manifest = Array.isArray(order?.directSale?.imeManifest)
    ? order.directSale.imeManifest
    : [];
  const soldCodes = Array.isArray(order?.soldImeCodes) ? order.soldImeCodes : [];

  let unitRows = manifest.map((row, idx) => ({
    rowNumber: idx + 1,
    productName: row.productName || orderProductName(order),
    brand: row.brand || '',
    capacity: row.capacity || '',
    color: row.color || '',
    ime: row.ime || '',
    unitPrice: Number(row.unitPrice) > 0 ? row.unitPrice : unitPrice,
  }));

  if (!unitRows.length && soldCodes.length) {
    unitRows = soldCodes.map((ime, idx) => ({
      rowNumber: idx + 1,
      productName: orderProductName(order),
      brand: '',
      capacity: '',
      color: '',
      ime: String(ime || '').trim(),
      unitPrice,
    }));
  }

  if (!unitRows.length) {
    for (let i = 0; i < qty; i += 1) {
      unitRows.push({
        rowNumber: i + 1,
        productName: orderProductName(order),
        brand: '',
        capacity: '',
        color: '',
        ime: '—',
        unitPrice,
      });
    }
  }

  const userNotes = String(order?.userNotes || '');
  const customerMatch = userNotes.match(/Customer:\s*([^—\n]+)/i);
  const customerName =
    String(order?.directSale?.customerName || '').trim() ||
    (customerMatch ? customerMatch[1].trim() : '') ||
    String(order?.businessName || order?.userId?.businessName || 'Customer').trim();

  const isRetail = /\[Direct sale\s*[—-]\s*in-Shop\s*[—-]\s*Retail\]/i.test(userNotes);
  const saleType =
    order?.directSale?.type || (isRetail ? 'retail' : isDirectOrder(order) ? 'wholesale' : '');
  const paymentMethod =
    String(order?.directSale?.paymentMethod || '').trim().toLowerCase() || 'cash';

  const handledBy = order?.handledBy;
  const handledById = String(
    (typeof handledBy === 'object' ? handledBy?._id ?? handledBy?.id : handledBy) ?? '',
  ).trim();
  const salespersonName =
    (typeof handledBy === 'object' ? String(handledBy?.name || '').trim() : '') ||
    String(order?.handledByName || order?.completedByName || '').trim();

  const assignedWarehouseId = orderAssignedShopId(order);

  return {
    customerName,
    buyerName: order?.businessName || order?.userId?.businessName || '',
    shopName: resolveReceiptShopName(order, shop),
    assignedWarehouseId,
    handledById,
    salespersonName,
    saleType,
    paymentMethod,
    purchaseLines: [
      {
        productName: orderProductName(order),
        brand: unitRows[0]?.brand || order?.productId?.brand || '',
        quantity: qty,
        unitPrice,
        lineTotal,
      },
    ],
    unitRows,
    grandTotal: lineTotal,
    orderRef: orderDisplayCode(order) !== '—' ? orderDisplayCode(order) : orderId(order).slice(-8) || '—',
    soldAt: order?.handledAt || order?.createdAt || null,
  };
}

/**
 * Build receipt payload from in-progress direct sale form state.
 */
export function buildReceiptPayloadFromSaleForm({
  customerName,
  customerPhone,
  customerEmail,
  buyerName,
  purchaseLines = [],
  unitRows = [],
  grandTotal = 0,
  deliveryCity,
  shopName,
  saleType,
  paymentMethod,
  orderRef,
  soldAt,
}) {
  return {
    customerName: String(customerName || '').trim(),
    customerPhone: String(customerPhone || '').trim(),
    customerEmail: String(customerEmail || '').trim(),
    buyerName: String(buyerName || '').trim(),
    shopName: String(shopName || '').trim(),
    saleType: saleType || '',
    paymentMethod: String(paymentMethod || '').trim().toLowerCase() || 'cash',
    purchaseLines: Array.isArray(purchaseLines) ? purchaseLines : [],
    unitRows: Array.isArray(unitRows) ? unitRows : [],
    grandTotal: Number(grandTotal) || 0,
    deliveryCity: String(deliveryCity || '').trim(),
    orderRef: orderRef || '',
    soldAt: soldAt || new Date().toISOString(),
  };
}

function receiptHtml(payload) {
  const lines = Array.isArray(payload.purchaseLines) ? payload.purchaseLines : [];
  const units = Array.isArray(payload.unitRows) ? payload.unitRows : [];
  const total = Number(payload.grandTotal) || 0;

  const lineRows = lines
    .map((line) => {
      const qty = Math.max(0, Number(line.quantity) || 0);
      const unitPrice = Number(line.unitPrice) || 0;
      const lineTotal =
        Number(line.lineTotal) > 0 ? Number(line.lineTotal) : unitPrice * Math.max(1, qty || 1);
      return `
      <tr>
        <td>${escapeHtml(line.productName || 'Product')}</td>
        <td>${escapeHtml(line.brand || '—')}</td>
        <td class="num">${escapeHtml(qty)}</td>
        <td class="num">${escapeHtml(formatMoneyXaf(unitPrice))}</td>
        <td class="num">${escapeHtml(formatMoneyXaf(lineTotal))}</td>
      </tr>`;
    })
    .join('');

  const unitRows = units
    .map(
      (row, idx) => `
      <tr>
        <td class="num">${row.rowNumber ?? idx + 1}</td>
        <td>${escapeHtml(row.productName || '—')}</td>
        <td>${escapeHtml(row.brand || '—')}</td>
        <td>${escapeHtml(row.capacity || '—')}</td>
        <td>${escapeHtml(row.color || '—')}</td>
        <td><code>${escapeHtml(row.ime || '—')}</code></td>
        <td class="num">${escapeHtml(formatMoneyXaf(Number(row.unitPrice) || 0))}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Wache receipt ${escapeHtml(payload.orderRef || '')}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; }
    .receipt { max-width: 720px; margin: 0 auto; }
    .logo-wrap { margin-bottom: 10px; }
    .logo { height: 44px; width: auto; display: block; object-fit: contain; }
    .brand { color: #6c5ce7; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
    h1 { margin: 4px 0 2px; font-size: 20px; }
    .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    .party { display: grid; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 13px; }
    .party div { display: grid; gap: 2px; }
    .party span { color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
    h2 { font-size: 13px; margin: 18px 0 8px; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    th, td { border: 1px solid #dbe2ea; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
    td.num, th.num { text-align: right; }
    code { font-size: 11px; }
    .total { display: flex; justify-content: space-between; align-items: center; border-top: 2px solid #0f172a; margin-top: 16px; padding-top: 12px; font-size: 16px; font-weight: 700; }
    .footer { margin-top: 24px; font-size: 11px; color: #64748b; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="logo-wrap">
      <img class="logo" src="/logo-240.jpg" alt="Wache Electronics logo" />
    </div>
    <p class="brand">Wache Electronics</p>
    <h1>Sales receipt</h1>
    <p class="meta">
      ${escapeHtml(saleTypeLabel(payload.saleType))}
      · ${escapeHtml(formatReceiptDate(payload.soldAt))}
      ${payload.orderRef ? ` · Ref ${escapeHtml(payload.orderRef)}` : ''}
    </p>
    <div class="party">
      <div><span>Customer</span><strong>${escapeHtml(payload.customerName || '—')}</strong></div>
      ${payload.customerPhone ? `<div><span>Phone</span><strong>${escapeHtml(payload.customerPhone)}</strong></div>` : ''}
      ${payload.customerEmail ? `<div><span>Email</span><strong>${escapeHtml(payload.customerEmail)}</strong></div>` : ''}
      ${payload.buyerName && payload.saleType !== 'retail' ? `<div><span>Vendor account</span><strong>${escapeHtml(payload.buyerName)}</strong></div>` : ''}
      <div><span>Transaction method</span><strong>${escapeHtml(paymentMethodLabel(payload.paymentMethod))}</strong></div>
      ${payload.salespersonName ? `<div><span>Salesperson</span><strong>${escapeHtml(payload.salespersonName)}</strong></div>` : ''}
      ${payload.shopName ? `<div><span>Handover</span><strong>${escapeHtml(payload.shopName)}</strong></div>` : ''}
    </div>
    <h2>Line items</h2>
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Brand</th>
          <th class="num">Qty</th>
          <th class="num">Unit price</th>
          <th class="num">Line total</th>
        </tr>
      </thead>
      <tbody>${lineRows || '<tr><td colspan="5">No lines</td></tr>'}</tbody>
    </table>
    <h2>Units &amp; IME</h2>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Product</th>
          <th>Brand</th>
          <th>Capacity</th>
          <th>Color</th>
          <th>IME</th>
          <th class="num">Unit price</th>
        </tr>
      </thead>
      <tbody>${unitRows || '<tr><td colspan="7">No units</td></tr>'}</tbody>
    </table>
    <div class="total">
      <span>Final price</span>
      <span>${escapeHtml(formatMoneyXaf(total))}</span>
    </div>
    <p class="footer">Thank you for your business — Wache Electronics</p>
    <p class="no-print footer"><button onclick="window.print()">Print</button></p>
  </div>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;
}

/** Open browser print dialog for a direct sale receipt. */
export function printDirectSaleReceipt(payload) {
  if (typeof window === 'undefined' || !payload) return;
  const html = receiptHtml(payload);
  const printWindow = window.open('', '_blank', 'width=900,height=900');
  if (!printWindow) {
    throw new Error('Pop-up blocked. Allow pop-ups to print receipts.');
  }
  try {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } catch {
    // Some browsers/environments can fail document.write on the new tab.
    // Fall back to a Blob URL to ensure content still renders.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    printWindow.location.href = blobUrl;
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }

  const runPrint = () => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {
      // ignore; the in-page print button remains available
    }
  };

  if (printWindow.document?.readyState === 'complete') {
    setTimeout(runPrint, 120);
  } else {
    printWindow.onload = () => setTimeout(runPrint, 120);
  }
}
