import { useMemo } from 'react';
import {
  buildReceiptPayloadFromOrder,
  printDirectSaleReceipt,
} from '../../utils/directSaleReceiptPrint';
import { filterPortalEarningsOrders } from '../../utils/salespersonMonthlySales';
import MoneyXaf from '../MoneyXaf';
import {
  isDirectOrder,
  orderAmount,
  orderEffectiveQuantity,
  orderId,
  orderProductName,
  orderDisplayCode,
} from '../../utils/orderDisplay';
import './SalesTransactionReceipts.css';

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-CM', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function saleTypeLabel(order) {
  const t = String(order?.directSale?.type || '').toLowerCase();
  if (t === 'retail') return 'Retail';
  if (t === 'wholesale') return 'Vendor';
  if (/\[Direct sale[^\]]*Retail\]/i.test(String(order?.userNotes || ''))) return 'Retail';
  return 'Direct';
}

function directSaleBatchKey(order) {
  const batchId = order?.directSale?.saleBatchId;
  if (batchId != null && String(batchId).trim()) return `batch:${String(batchId)}`;
  return `order:${orderId(order) || orderProductName(order)}`;
}

/** One row per in-shop sale; multi-line sales share saleBatchId on the server. */
function groupDirectSaleOrdersForReceipts(orders) {
  const groups = new Map();
  for (const order of orders) {
    const key = directSaleBatchKey(order);
    const lineIndex = Number(order?.directSale?.receiptLineIndex);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, order);
      continue;
    }
    const existingIndex = Number(existing?.directSale?.receiptLineIndex);
    if (Number.isFinite(lineIndex) && (!Number.isFinite(existingIndex) || lineIndex < existingIndex)) {
      groups.set(key, order);
    }
  }
  return Array.from(groups.values());
}

function receiptProductSummary(payload, order) {
  const lines = Array.isArray(payload?.purchaseLines) ? payload.purchaseLines : [];
  if (lines.length > 1) {
    return `${lines.length} products`;
  }
  if (lines.length === 1) {
    return lines[0].productName || orderProductName(order);
  }
  return orderProductName(order);
}

function receiptQuantityTotal(payload, order) {
  const units = Array.isArray(payload?.unitRows) ? payload.unitRows.length : 0;
  if (units > 0) return units;
  const lines = Array.isArray(payload?.purchaseLines) ? payload.purchaseLines : [];
  if (lines.length) {
    return lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  }
  return orderEffectiveQuantity(order);
}

export default function SalesTransactionReceipts({
  orders = [],
  shop = null,
  staffUserId,
  staffName = '',
}) {
  const transactions = useMemo(() => {
    const scoped = filterPortalEarningsOrders(orders, shop, staffUserId);
    const direct = scoped
      .filter((order) => isDirectOrder(order))
      .sort((a, b) => {
        const ta = new Date(a?.handledAt || a?.createdAt || 0).getTime();
        const tb = new Date(b?.handledAt || b?.createdAt || 0).getTime();
        return tb - ta;
      });
    return groupDirectSaleOrdersForReceipts(direct);
  }, [orders, shop, staffUserId]);

  const handlePrint = (order) => {
    try {
      printDirectSaleReceipt(buildReceiptPayloadFromOrder(order, shop));
    } catch (err) {
      window.alert(err?.message || 'Could not open print dialog.');
    }
  };

  return (
    <section className="sales-txn-receipts wh-panel">
      <header className="sales-txn-receipts__head">
        <h2>Transaction receipts</h2>
        <p>
          Print a receipt for any direct sale
          {staffName ? ` recorded by ${staffName}` : ''}
          {shop?.name ? ` at ${shop.name}` : ''}.
        </p>
      </header>

      {transactions.length === 0 ? (
        <p className="sales-hint">No completed direct sales to print yet.</p>
      ) : (
        <div className="sales-table-wrap">
          <table className="sales-table sales-txn-receipts__table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Product</th>
                <th>Qty</th>
                <th className="fit-numeric-cell">Total</th>
                <th>Type</th>
                <th>Ref</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {transactions.map((order) => {
                const id = directSaleBatchKey(order);
                const payload = buildReceiptPayloadFromOrder(order, shop);
                return (
                  <tr key={id}>
                    <td>{formatWhen(order?.handledAt || order?.createdAt)}</td>
                    <td>{payload.customerName || '—'}</td>
                    <td>{receiptProductSummary(payload, order)}</td>
                    <td>{receiptQuantityTotal(payload, order)}</td>
                    <td className="fit-numeric-cell">
                      <MoneyXaf value={payload.grandTotal ?? orderAmount(order)} />
                    </td>
                    <td>{saleTypeLabel(order)}</td>
                    <td>
                      <code>{payload.orderRef || orderDisplayCode(order)}</code>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sales-txn-receipts__print-btn"
                        onClick={() => handlePrint(order)}
                      >
                        Print receipt
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
