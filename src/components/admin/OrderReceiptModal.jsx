import { useEffect, useMemo, useRef, useState } from 'react';
import { AppModal } from '../AppDialog';
import { fetchSalespeopleByShop } from '../../api/adminApi';
import { patchOrderReceipt } from '../../api/ordersListApi';
import { fetchWarehouses, warehouseId } from '../../api/warehouseApi';
import { downloadVendorOrderReceiptPdf } from '../../utils/directSaleReceiptExport';
import {
  buildReceiptPayloadFromOrder,
  printDirectSaleReceipt,
} from '../../utils/directSaleReceiptPrint';
import MoneyXaf from '../MoneyXaf';
import { formatNumberWithCommas, parseFormattedNumber } from '../../utils/formatMoneyXaf';
import { orderId, orderProductName, orderAssignedShopId, orderShopRef } from '../../utils/orderDisplay';
import useTransactionMethods from '../../hooks/useTransactionMethods';
import '../admin/DirectSalePanel.css';
import './OrderReceiptModal.css';

function clonePayload(payload) {
  return {
    ...payload,
    purchaseLines: (payload.purchaseLines || []).map((line) => ({ ...line })),
    unitRows: (payload.unitRows || []).map((row, idx) => ({
      ...row,
      rowNumber: row.rowNumber ?? idx + 1,
    })),
  };
}

function userStableId(user) {
  return String(user?._id ?? user?.id ?? '').trim();
}

function resolveOrderHandledById(order) {
  const handledBy = order?.handledBy;
  if (handledBy && typeof handledBy === 'object') {
    return String(handledBy._id ?? handledBy.id ?? '').trim();
  }
  return String(order?.handledBy ?? order?.handledById ?? '').trim();
}

function resolveReceiptAssignment(order, form) {
  const assignedWarehouseId = String(form?.assignedWarehouseId || orderAssignedShopId(order) || '').trim();
  const handledById = String(form?.handledById || resolveOrderHandledById(order) || '').trim();
  return { assignedWarehouseId, handledById };
}

function payloadToSaveBody(form, order) {
  const grandTotal = Math.max(0, Math.round(Number(form.grandTotal) || 0));
  const { assignedWarehouseId, handledById } = resolveReceiptAssignment(order, form);
  return {
    assignedWarehouseId,
    handledById,
    grandTotal,
    purchaseLines: (form.purchaseLines || []).map((line) => ({
      quantity: Math.max(0, Number(line.quantity) || 0),
      unitPrice: Math.max(0, Math.round(Number(line.unitPrice) || 0)),
      lineTotal: grandTotal,
    })),
    unitRows: (form.unitRows || []).map((row, idx) => ({
      rowNumber: row.rowNumber ?? idx + 1,
      ime: String(row.ime || '').trim(),
      unitPrice: Math.max(
        0,
        Math.round(Number(row.unitPrice) || (form.unitRows?.length ? grandTotal / form.unitRows.length : grandTotal)),
      ),
    })),
  };
}

function normalizeSavedOrder(raw) {
  if (!raw) return null;
  if (typeof raw.toObject === 'function') return raw.toObject();
  const id = raw._id ?? raw.id;
  if (id != null && String(id).trim()) return raw;
  if (raw.success === true && raw.data) return normalizeSavedOrder(raw.data);
  if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    return normalizeSavedOrder(raw.data);
  }
  return null;
}

function applyFinalPrice(form, rawValue) {
  const grandTotal = Math.max(0, Math.round(Number(parseFormattedNumber(rawValue)) || 0));
  const unitRows = (form.unitRows || []).map((row) => ({ ...row }));
  const qty =
    unitRows.length ||
    Math.max(1, Number(form.purchaseLines?.[0]?.quantity) || Number(form.quantity) || 1);
  const perUnit = qty > 0 ? Math.round(grandTotal / qty) : grandTotal;
  const pricedRows = unitRows.length
    ? unitRows.map((row) => ({ ...row, unitPrice: perUnit }))
    : unitRows;
  const purchaseLines = (form.purchaseLines || []).map((line, idx) => {
    if (idx !== 0) return { ...line, lineTotal: grandTotal, unitPrice: perUnit, quantity: qty };
    return {
      ...line,
      quantity: qty,
      unitPrice: perUnit,
      lineTotal: grandTotal,
    };
  });
  const nextPurchaseLines =
    purchaseLines.length > 0
      ? purchaseLines
      : [
          {
            productName: form.purchaseLines?.[0]?.productName || '',
            brand: form.purchaseLines?.[0]?.brand || '',
            quantity: qty,
            unitPrice: perUnit,
            lineTotal: grandTotal,
          },
        ];
  return { ...form, unitRows: pricedRows, purchaseLines: nextPurchaseLines, grandTotal };
}

function locationOptionLabel(w) {
  const name = String(w?.name || 'Shop').trim();
  const city = String(w?.city || '').trim();
  return city ? `${name} (${city})` : name;
}

function matchShopIdByName(shops, nameHint) {
  const hint = String(nameHint || '').trim().toLowerCase();
  if (!hint || !shops?.length) return '';

  const match = shops.find((shop) => {
    const shopName = String(shop?.name || '').trim().toLowerCase();
    if (shopName && (shopName === hint || hint.includes(shopName) || shopName.includes(hint))) {
      return true;
    }
    const label = locationOptionLabel(shop).toLowerCase();
    return label === hint || label.includes(hint) || hint.includes(label);
  });
  return match ? warehouseId(match) : '';
}

/** Apply saved receipt total onto an order object (API may return stale nested directSale). */
function mergeOrderWithSavedReceiptPrice(order, grandTotal, form) {
  const total = Math.max(0, Math.round(Number(grandTotal) || 0));
  const qty =
    (form?.unitRows || []).length ||
    Math.max(1, Number(form?.purchaseLines?.[0]?.quantity) || Number(form?.quantity) || 1);
  const perUnit = qty > 0 ? Math.round(total / qty) : total;
  const prevDirect =
    order?.directSale && typeof order.directSale === 'object' && !Array.isArray(order.directSale)
      ? order.directSale
      : {};
  const next = { ...order };
  next.finalPrice = total;
  next.originalTotal = total;
  next.productPrice = perUnit;
  if (next.totalAmount != null) next.totalAmount = total;
  if (next.total != null) next.total = total;
  if (next.amount != null) next.amount = total;
  next.directSale = {
    ...prevDirect,
    receiptGrandTotal: total,
    soldUnitPrice: perUnit,
  };
  return next;
}

export default function OrderReceiptModal({
  open,
  order,
  axiosPrivate,
  onClose,
  onSaved,
}) {
  const { labelForMethod } = useTransactionMethods();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveOk, setSaveOk] = useState('');
  const editSectionRef = useRef(null);
  const skipFormSyncRef = useRef(false);

  const [shops, setShops] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const staffCacheRef = useRef(new Map());

  const basePayload = useMemo(
    () => (order ? buildReceiptPayloadFromOrder(order) : null),
    [order],
  );

  useEffect(() => {
    if (!open || !axiosPrivate) return undefined;
    let cancelled = false;
    setShopsLoading(true);
    setLoadErr('');

    fetchWarehouses(axiosPrivate)
      .then((data) => {
        if (cancelled) return;
        const subs = Array.isArray(data?.subWarehouses) ? data.subWarehouses : [];
        setShops(
          [...subs].sort((a, b) =>
            locationOptionLabel(a).localeCompare(locationOptionLabel(b), undefined, {
              sensitivity: 'base',
            }),
          ),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setShops([]);
        setLoadErr(err?.response?.data?.message || err?.message || 'Could not load shops.');
      })
      .finally(() => {
        if (!cancelled) setShopsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, axiosPrivate]);

  useEffect(() => {
    const shopId = String(form?.assignedWarehouseId || orderAssignedShopId(order) || '').trim();
    if (!open || !axiosPrivate || !shopId) {
      setStaffOptions([]);
      setStaffLoading(false);
      return undefined;
    }

    const cached = staffCacheRef.current.get(shopId);
    if (cached) {
      setStaffOptions(cached);
      setStaffLoading(false);
      return undefined;
    }

    let cancelled = false;
    setStaffLoading(true);
    setStaffOptions([]);

    fetchSalespeopleByShop(axiosPrivate, shopId)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        staffCacheRef.current.set(shopId, list);
        setStaffOptions(list);
      })
      .catch(() => {
        if (cancelled) return;
        setStaffOptions([]);
      })
      .finally(() => {
        if (!cancelled) setStaffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, axiosPrivate, form?.assignedWarehouseId, order]);

  useEffect(() => {
    if (!open || !shops.length || !form) return undefined;
    if (String(form.assignedWarehouseId || '').trim()) return undefined;

    const shopRef = order ? orderShopRef(order) : { name: '' };
    const nameHint =
      form.shopName || order?.directSale?.assignedWarehouseName || shopRef.name || '';
    const matchedId = matchShopIdByName(shops, nameHint);
    if (!matchedId) return undefined;

    const match = shops.find((shop) => warehouseId(shop) === matchedId);
    setForm((prev) => {
      if (!prev || String(prev.assignedWarehouseId || '').trim()) return prev;
      return {
        ...prev,
        assignedWarehouseId: matchedId,
        shopName: match ? locationOptionLabel(match) : prev.shopName,
      };
    });
    return undefined;
  }, [open, shops, form?.assignedWarehouseId, form?.shopName, order]);

  useEffect(() => {
    if (!open || !basePayload) return;
    if (editing) return;
    if (skipFormSyncRef.current) {
      skipFormSyncRef.current = false;
      return;
    }
    setForm(clonePayload(basePayload));
    setError('');
    setSaving(false);
  }, [open, orderId(order), editing]);

  useEffect(() => {
    if (!editing || !editSectionRef.current) return undefined;
    const frame = requestAnimationFrame(() => {
      editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [editing]);

  const assignableStaffOptions = useMemo(() => {
    const selectedShopId = String(form?.assignedWarehouseId || orderAssignedShopId(order) || '').trim();
    if (!selectedShopId) {
      const currentId = String(form?.handledById || resolveOrderHandledById(order) || '').trim();
      if (!currentId) return [];
      const label = String(form?.salespersonName || '').trim() || 'Current salesperson';
      return [{ id: currentId, label: `${label} (current)` }];
    }

    let options = (staffOptions || [])
      .sort((a, b) =>
        String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }),
      )
      .map((user) => ({
        id: userStableId(user),
        label: user?.name || 'Salesperson',
      }));

    const currentId = String(form?.handledById || '').trim();
    if (currentId && !options.some((opt) => opt.id === currentId)) {
      const label = String(form?.salespersonName || '').trim() || 'Current salesperson';
      options = [{ id: currentId, label: `${label} (current)` }, ...options];
    }

    return options;
  }, [form?.assignedWarehouseId, form?.handledById, form?.salespersonName, staffOptions, order]);

  const selectedShop = useMemo(() => {
    const id = String(form?.assignedWarehouseId || '').trim();
    return shops.find((shop) => warehouseId(shop) === id) || null;
  }, [form?.assignedWarehouseId, shops]);

  const selectedStaffLabel = useMemo(() => {
    const id = String(form?.handledById || '').trim();
    return assignableStaffOptions.find((opt) => opt.id === id)?.label || form?.salespersonName || '';
  }, [assignableStaffOptions, form?.handledById, form?.salespersonName]);

  const startEditing = () => {
    setEditing(true);
    setError('');
    setSaveOk('');
  };

  const handleShopChange = (shopId) => {
    setForm((prev) => {
      if (!prev) return prev;
      const shop = shops.find((row) => warehouseId(row) === shopId);
      return {
        ...prev,
        assignedWarehouseId: shopId,
        shopName: shop ? locationOptionLabel(shop) : '',
        handledById: '',
        salespersonName: '',
      };
    });
  };

  if (!open || !order || !form) return null;

  const resolvedShopId = String(form.assignedWarehouseId || orderAssignedShopId(order) || '').trim();
  const orderHandlerId = resolveOrderHandledById(order);

  const previewPayload = {
    ...form,
    shopName: selectedShop ? locationOptionLabel(selectedShop) : form.shopName,
    salespersonName: selectedStaffLabel || form.salespersonName,
  };

  const handleSave = async () => {
    const id = orderId(order);
    if (!id || !axiosPrivate) return;

    const grandTotal = Math.max(0, Math.round(Number(form.grandTotal) || 0));
    if (grandTotal <= 0) {
      setError('Enter a final price greater than zero.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveOk('');
    try {
      const payload = payloadToSaveBody(form, order);
      const raw = await patchOrderReceipt(axiosPrivate, id, payload);
      const updated = normalizeSavedOrder(raw);
      if (!updated?._id && !updated?.id) {
        throw new Error('Receipt saved but the server returned no order data.');
      }
      const merged = mergeOrderWithSavedReceiptPrice(updated, grandTotal, form);
      skipFormSyncRef.current = true;
      const nextForm = clonePayload(buildReceiptPayloadFromOrder(merged));
      setForm(nextForm);
      setEditing(false);
      onSaved?.(merged);
      setSaveOk('Receipt saved.');
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not save receipt.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePrint = () => {
    try {
      printDirectSaleReceipt(previewPayload);
    } catch (err) {
      setError(err?.message || 'Could not open print dialog.');
    }
  };

  const handleDownload = () => {
    downloadVendorOrderReceiptPdf({
      ...previewPayload,
      fileNameBase: `order-receipt-${orderId(order)}`,
    });
  };

  return (
    <AppModal
      open={open}
      title="Order receipt"
      wide
      dialogClassName="app-dialog--receipt"
      onClose={onClose}
      footer={
        <div className="order-receipt-modal__footer">
          <button type="button" className="order-receipt-modal__btn order-receipt-modal__btn--ghost" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="order-receipt-modal__btn order-receipt-modal__btn--ghost"
            onClick={handleDownload}
          >
            Download PDF
          </button>
          <button
            type="button"
            className="order-receipt-modal__btn order-receipt-modal__btn--ghost"
            onClick={handlePrint}
          >
            Print receipt
          </button>
          {editing ? (
            <>
              <button
                type="button"
                className="order-receipt-modal__btn order-receipt-modal__btn--ghost"
                disabled={saving}
                onClick={() => {
                  setForm(clonePayload(basePayload));
                  setEditing(false);
                  setError('');
                }}
              >
                Cancel edit
              </button>
              <button
                type="button"
                className="order-receipt-modal__btn order-receipt-modal__btn--primary"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="order-receipt-modal__btn order-receipt-modal__btn--primary"
              onClick={startEditing}
            >
              Edit receipt
            </button>
          )}
        </div>
      }
    >
      <div className="order-receipt-modal">
        <p className="order-receipt-modal__sub">
          {orderProductName(order)} · Ref {previewPayload.orderRef || '—'}
        </p>

        {error ? (
          <p className="order-receipt-modal__error" role="alert">
            {error}
          </p>
        ) : null}
        {saveOk && !editing ? (
          <p className="order-receipt-modal__success" role="status">
            {saveOk}
          </p>
        ) : null}
        {loadErr && editing ? (
          <p className="order-receipt-modal__error" role="alert">
            {loadErr}
          </p>
        ) : null}

        <article className="admin-direct-sale-receipt order-receipt-modal__preview">
          <header className="admin-direct-sale-receipt__head">
            <p className="admin-direct-sale-receipt__brand">Wache Electronics</p>
            <h4>Sales receipt</h4>
            <p className="admin-direct-sale-receipt__meta">
              {previewPayload.soldAt
                ? new Date(previewPayload.soldAt).toLocaleString('fr-CM')
                : new Date().toLocaleString('fr-CM')}
            </p>
          </header>

          <div className="admin-direct-sale-receipt__party">
            <p>
              <span>Customer</span>
              <strong>{form.customerName || '—'}</strong>
            </p>
            {form.buyerName ? (
              <p>
                <span>Vendor account</span>
                <strong>{form.buyerName}</strong>
              </p>
            ) : null}
            <p>
              <span>Transaction method</span>
              <strong>{labelForMethod(form.paymentMethod)}</strong>
            </p>
            {previewPayload.salespersonName ? (
              <p>
                <span>Salesperson</span>
                <strong>{previewPayload.salespersonName}</strong>
              </p>
            ) : null}
            {previewPayload.shopName ? (
              <p>
                <span>Handover</span>
                <strong>{previewPayload.shopName}</strong>
              </p>
            ) : null}
          </div>

          <div className="admin-direct-sale-receipt__lines">
            <h5>Line items</h5>
            <div className="sales-table-wrap">
              <table className="sales-table admin-direct-sale-receipt-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.purchaseLines || []).map((line, idx) => (
                    <tr key={`line-${idx}`}>
                      <td>{line.productName || '—'}</td>
                      <td>{line.brand || '—'}</td>
                      <td>{line.quantity ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="admin-direct-sale-receipt__units">
            <h5>Units &amp; IME codes</h5>
            <div className="sales-table-wrap">
              <table className="sales-table admin-direct-sale-receipt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Brand</th>
                    <th>Capacity</th>
                    <th>Color</th>
                    <th>IME</th>
                  </tr>
                </thead>
                <tbody>
                  {(form.unitRows || []).length ? (
                    form.unitRows.map((row, idx) => (
                      <tr key={`unit-${idx}`}>
                        <td>{row.rowNumber ?? idx + 1}</td>
                        <td>{row.productName || '—'}</td>
                        <td>{row.brand || '—'}</td>
                        <td>{row.capacity || '—'}</td>
                        <td>{row.color || '—'}</td>
                        <td>
                          <code>{row.ime || '—'}</code>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>No unit rows on this receipt.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="admin-direct-sale-receipt__total order-receipt-modal__total">
            <span className="order-receipt-modal__total-label">Final price</span>
            <strong className="order-receipt-modal__total-amount">
              <MoneyXaf value={form.grandTotal} minScale={0.45} />
            </strong>
          </footer>
        </article>

        {editing ? (
          <section ref={editSectionRef} className="order-receipt-modal__edit" id="order-receipt-edit">
            <h3>Edit receipt</h3>
            {error ? (
              <p className="order-receipt-modal__error" role="alert">
                {error}
              </p>
            ) : null}
            {saveOk ? (
              <p className="order-receipt-modal__success" role="status">
                {saveOk}
              </p>
            ) : null}
            <p className="order-receipt-modal__edit-hint">
              Update shop, salesperson, and the final sale price. Product names, customer details, and
              IME codes cannot be changed here.
            </p>
            <div className="order-receipt-modal__edit-grid">
              <label>
                <span>Shop</span>
                <select
                  value={form.assignedWarehouseId || ''}
                  onChange={(e) => handleShopChange(e.target.value)}
                  disabled={shopsLoading}
                >
                  <option value="">{shopsLoading ? 'Loading shops…' : 'Select shop…'}</option>
                  {(() => {
                    const currentId = String(form.assignedWarehouseId || '').trim();
                    const listed = currentId && shops.some((s) => warehouseId(s) === currentId);
                    if (currentId && !listed) {
                      return (
                        <option value={currentId}>
                          {form.shopName || 'Current shop'}
                        </option>
                      );
                    }
                    return null;
                  })()}
                  {shops.map((shop) => {
                    const id = warehouseId(shop);
                    if (!id) return null;
                    return (
                      <option key={id} value={id}>
                        {locationOptionLabel(shop)}
                      </option>
                    );
                  })}
                </select>
              </label>
              <label>
                <span>Salesperson</span>
                <select
                  value={form.handledById || orderHandlerId || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      handledById: e.target.value,
                      salespersonName:
                        assignableStaffOptions.find((opt) => opt.id === e.target.value)?.label || '',
                    }))
                  }
                  disabled={
                    staffLoading ||
                    (!resolvedShopId && !orderHandlerId) ||
                    (Boolean(resolvedShopId) &&
                      !staffLoading &&
                      assignableStaffOptions.length === 0 &&
                      !orderHandlerId)
                  }
                >
                  {!resolvedShopId ? (
                    orderHandlerId ? (
                      <option value={orderHandlerId}>
                        {form.salespersonName || 'Current salesperson'}
                      </option>
                    ) : (
                      <option value="">Select a shop first</option>
                    )
                  ) : staffLoading ? (
                    <option value="">Loading staff…</option>
                  ) : assignableStaffOptions.length === 0 ? (
                    <option value="">No salesperson assigned to this shop</option>
                  ) : (
                    <>
                      <option value="">Select salesperson…</option>
                      {assignableStaffOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>
            </div>

            <label className="order-receipt-modal__price-field order-receipt-modal__price-field--final">
              <span>Final price (XAF)</span>
              <input
                type="text"
                inputMode="numeric"
                value={formatNumberWithCommas(form.grandTotal ?? 0)}
                onChange={(e) => setForm((prev) => applyFinalPrice(prev, e.target.value))}
                onBlur={(e) => setForm((prev) => applyFinalPrice(prev, e.target.value))}
              />
            </label>
          </section>
        ) : null}
      </div>
    </AppModal>
  );
}
