import { useEffect, useMemo, useState } from 'react';
import { deleteOrder, patchOrderAccept, patchOrderReject } from '../../api/ordersListApi';
import BusinessLocationSelect from '../BusinessLocationSelect';
import { ConfirmDialog } from '../AppDialog';
import { coerceBusinessLocation, deliveryAddressPayloadForOrderAccept } from '../../data/businessLocations';
import { formatMonthLabel } from '../../utils/orderMonthUtils';
import { downloadOrdersAsPdf } from '../../utils/ordersMonthlyPdf';
import { downloadVendorOrderReceiptPdf } from '../../utils/directSaleReceiptExport';
import { buildReceiptPayloadFromOrder, printDirectSaleReceipt } from '../../utils/directSaleReceiptPrint';
import MoneyXaf from '../MoneyXaf';
import VendorOrderImeAcceptFields from './VendorOrderImeAcceptFields';
import {
  ORDERS_MONTH_ALL,
  completedByLabel,
  formatMoney,
  isDirectOrder,
  isSiteBuyOrder,
  isVendorWebBuyOrder,
  normalizeOrderKind,
  normalizeOrderStatus,
  orderAmount,
  orderBusinessAddress,
  orderBusinessName,
  orderId,
  orderDisplayCode,
  orderMonthKey,
  orderProductName,
  orderProductCapacity,
  orderProductPrice,
  orderTel,
  orderWhatsappNumber,
  orderEffectiveQuantity,
  orderVisibleInShopList,
} from '../../utils/orderDisplay';
import '../admin/AdminOrdersPanel.css';
import OrderReceiptModal from '../admin/OrderReceiptModal';
import '../admin/OrderReceiptModal.css';

const ORDER_KIND_TAB_SEQUENCE = ['buy', 'direct', 'offer', 'preorder'];

function mergeOrderPatch(existing, updated) {
  if (!updated) return existing;
  const prevDirect =
    existing?.directSale && typeof existing.directSale === 'object' ? existing.directSale : {};
  const nextDirect =
    updated?.directSale && typeof updated.directSale === 'object' ? updated.directSale : {};
  return { ...existing, ...updated, directSale: { ...prevDirect, ...nextDirect } };
}

function countOrdersForKindTab(orders, kindTab) {
  const list = Array.isArray(orders) ? orders : [];
  if (kindTab === 'buy') return list.filter((o) => isSiteBuyOrder(o)).length;
  if (kindTab === 'direct') return list.filter((o) => isDirectOrder(o)).length;
  if (kindTab === 'offer') return list.filter((o) => normalizeOrderKind(o) === 'offer').length;
  if (kindTab === 'preorder') return list.filter((o) => normalizeOrderKind(o) === 'preorder').length;
  return 0;
}

function firstOrderKindTabWithOrders(orders) {
  for (const kindTab of ORDER_KIND_TAB_SEQUENCE) {
    if (countOrdersForKindTab(orders, kindTab) > 0) return kindTab;
  }
  return 'buy';
}

export default function OrdersManagementPanel({
  orders = [],
  loading,
  error,
  currentUser,
  axiosPrivate,
  onOrdersReload,
  onOrderUpdated,
  allowDelete = true,
  filterOrder,
  eyebrow = 'Order management',
  title = 'Review & fulfill vendor orders',
  subtitle = 'Accept or reject buy, direct, offer, and preorder requests. Filter by month and track revenue.',
  pdfFilePrefix = 'wache-orders',
  showKpis = true,
  showShopFilter = false,
  showSalespersonFilter = false,
  showTypeTabs = true,
  showStatusTabs = true,
  lockStatusToAccepted = false,
  showCommissionSummary = false,
  commissionPerUnit = 3000,
  showHeroSummary = true,
  showHeroFilters = true,
  showTotalAmountMade = false,
  totalAmountLabel = 'Total amount made',
  tableWrapClassName = '',
  singleTableVerticalScroll = false,
  showReceiptActions = false,
}) {
  const sourceOrders = useMemo(
    () =>
      (typeof filterOrder === 'function' ? orders.filter(filterOrder) : orders).filter((o) =>
        orderVisibleInShopList(o),
      ),
    [orders, filterOrder],
  );

  const [orderKindTab, setOrderKindTab] = useState('buy');
  const [statusTab, setStatusTab] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState(ORDERS_MONTH_ALL);
  const [activeOrder, setActiveOrder] = useState(null);
  const [decisionType, setDecisionType] = useState('');
  const [staffNotes, setStaffNotes] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [decisionBusyId, setDecisionBusyId] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [deletingOrderId, setDeletingOrderId] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [selectedSalesperson, setSelectedSalesperson] = useState('');
  const [vendorImeSelection, setVendorImeSelection] = useState([]);
  const [vendorImeRequired, setVendorImeRequired] = useState(false);
  const [vendorCanFulfill, setVendorCanFulfill] = useState(true);
  const [receiptOrder, setReceiptOrder] = useState(null);

  const orderShopRef = (order) => {
    const directSale = order?.directSale && typeof order.directSale === 'object' ? order.directSale : {};
    const rawId =
      directSale?.assignedWarehouseId?._id ??
      directSale?.assignedWarehouseId?.id ??
      directSale?.assignedWarehouseId ??
      '';
    const id = rawId ? String(rawId) : '';
    const name = String(directSale?.assignedWarehouseName || '').trim();
    const key = id || name;
    return { id, name, key };
  };

  const orderSalespersonRef = (order) => {
    const handledBy = order?.handledBy;
    const id =
      handledBy && typeof handledBy === 'object'
        ? String(handledBy?._id || handledBy?.id || '')
        : String(order?.handledBy || '').trim();
    const name = String(
      (handledBy && typeof handledBy === 'object' ? handledBy?.name : '') ||
        order?.handledByName ||
        order?.completedByName ||
        'Staff',
    ).trim();
    const key = id || name;
    return { id, name, key };
  };

  const monthOptions = useMemo(() => {
    const map = new Map();
    sourceOrders.forEach((o) => {
      const key = orderMonthKey(o);
      if (!key) return;
      map.set(key, formatMonthLabel(key));
    });
    const rest = [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
    return [{ value: ORDERS_MONTH_ALL, label: 'All time' }, ...rest];
  }, [sourceOrders]);

  useEffect(() => {
    if (monthOptions.some((m) => m.value === selectedMonth)) return;
    setSelectedMonth(ORDERS_MONTH_ALL);
  }, [monthOptions, selectedMonth]);

  const monthlyOrders = useMemo(() => {
    if (selectedMonth === ORDERS_MONTH_ALL || !selectedMonth) return sourceOrders;
    return sourceOrders.filter((o) => orderMonthKey(o) === selectedMonth);
  }, [sourceOrders, selectedMonth]);

  const shopOptions = useMemo(() => {
    if (!showShopFilter) return [];
    const map = new Map();
    monthlyOrders.forEach((order) => {
      const shop = orderShopRef(order);
      if (!shop.key) return;
      if (!map.has(shop.key)) {
        map.set(shop.key, {
          value: shop.key,
          label: shop.name || (shop.id ? `Shop ${shop.id.slice(-6)}` : 'Shop'),
        });
      }
    });
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [monthlyOrders, showShopFilter]);

  const salespersonOptions = useMemo(() => {
    if (!showSalespersonFilter) return [];
    const map = new Map();
    monthlyOrders.forEach((order) => {
      const staff = orderSalespersonRef(order);
      if (!staff.key) return;
      if (!map.has(staff.key)) {
        map.set(staff.key, { value: staff.key, label: staff.name || 'Staff' });
      }
    });
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [monthlyOrders, showSalespersonFilter]);

  const scopedMonthlyOrders = useMemo(
    () =>
      monthlyOrders.filter((order) => {
        if (selectedShop) {
          const shop = orderShopRef(order);
          if (shop.key !== selectedShop) return false;
        }
        if (selectedSalesperson) {
          const staff = orderSalespersonRef(order);
          if (staff.key !== selectedSalesperson) return false;
        }
        return true;
      }),
    [monthlyOrders, selectedSalesperson, selectedShop],
  );

  const buyCountMonth = useMemo(
    () => scopedMonthlyOrders.filter((o) => isSiteBuyOrder(o)).length,
    [scopedMonthlyOrders],
  );
  const directCountMonth = useMemo(() => scopedMonthlyOrders.filter((o) => isDirectOrder(o)).length, [scopedMonthlyOrders]);
  const offerCountMonth = useMemo(
    () => scopedMonthlyOrders.filter((o) => normalizeOrderKind(o) === 'offer').length,
    [scopedMonthlyOrders],
  );
  const preorderCountMonth = useMemo(
    () => scopedMonthlyOrders.filter((o) => normalizeOrderKind(o) === 'preorder').length,
    [scopedMonthlyOrders],
  );

  useEffect(() => {
    if (!showTypeTabs) return;
    if (countOrdersForKindTab(scopedMonthlyOrders, orderKindTab) > 0) return;
    const fallbackTab = firstOrderKindTabWithOrders(scopedMonthlyOrders);
    if (fallbackTab !== orderKindTab) setOrderKindTab(fallbackTab);
  }, [showTypeTabs, scopedMonthlyOrders, orderKindTab]);

  const typeFilteredMonthly = useMemo(() => {
    if (!showTypeTabs) return scopedMonthlyOrders;
    if (orderKindTab === 'direct') return scopedMonthlyOrders.filter((o) => isDirectOrder(o));
    return scopedMonthlyOrders.filter((o) => {
      if (orderKindTab === 'buy') return isSiteBuyOrder(o);
      if (normalizeOrderKind(o) !== orderKindTab) return false;
      return true;
    });
  }, [scopedMonthlyOrders, orderKindTab, showTypeTabs]);

  const grouped = useMemo(() => {
    const g = { received: [], accepted: [], rejected: [] };
    typeFilteredMonthly.forEach((o) => {
      g[normalizeOrderStatus(o?.status)].push(o);
    });
    return g;
  }, [typeFilteredMonthly]);

  /** KPI totals use full reporting scope (month + shop/salesperson), not the active order-type tab. */
  const kpiGrouped = useMemo(() => {
    const g = { received: [], accepted: [], rejected: [] };
    scopedMonthlyOrders.forEach((o) => {
      g[normalizeOrderStatus(o?.status)].push(o);
    });
    return g;
  }, [scopedMonthlyOrders]);

  const receivedTotal = useMemo(
    () => kpiGrouped.received.reduce((s, o) => s + orderAmount(o), 0),
    [kpiGrouped.received],
  );
  const acceptedTotal = useMemo(
    () => kpiGrouped.accepted.reduce((s, o) => s + orderAmount(o), 0),
    [kpiGrouped.accepted],
  );
  const rejectedTotal = useMemo(
    () => kpiGrouped.rejected.reduce((s, o) => s + orderAmount(o), 0),
    [kpiGrouped.rejected],
  );
  const allTotal = useMemo(
    () => receivedTotal + acceptedTotal + rejectedTotal,
    [receivedTotal, acceptedTotal, rejectedTotal],
  );
  const netMade = allTotal - rejectedTotal;

  const visibleOrders = useMemo(() => {
    if (lockStatusToAccepted) return grouped.accepted || [];
    if (!showStatusTabs || statusTab === 'all') return typeFilteredMonthly;
    return grouped[statusTab] || [];
  }, [grouped, lockStatusToAccepted, showStatusTabs, statusTab, typeFilteredMonthly]);
  const totalAmountMade = useMemo(() => {
    const list = lockStatusToAccepted ? kpiGrouped.accepted || [] : visibleOrders;
    return list.reduce((sum, o) => sum + orderAmount(o), 0);
  }, [kpiGrouped.accepted, lockStatusToAccepted, visibleOrders]);

  const totalUnitsSold = useMemo(() => {
    const list = lockStatusToAccepted ? kpiGrouped.accepted || [] : visibleOrders;
    return list.reduce((sum, o) => sum + orderEffectiveQuantity(o), 0);
  }, [kpiGrouped.accepted, lockStatusToAccepted, visibleOrders]);
  const totalCommission = useMemo(
    () => totalUnitsSold * Math.max(0, Number(commissionPerUnit) || 0),
    [commissionPerUnit, totalUnitsSold],
  );
  const selectedShopLabel = useMemo(() => {
    if (!selectedShop) return '';
    const match = shopOptions.find((opt) => opt.value === selectedShop);
    return match?.label || 'Selected shop';
  }, [selectedShop, shopOptions]);
  const selectedSalespersonLabel = useMemo(() => {
    if (!selectedSalesperson) return '';
    const match = salespersonOptions.find((opt) => opt.value === selectedSalesperson);
    return match?.label || 'Selected salesperson';
  }, [selectedSalesperson, salespersonOptions]);

  const openDecisionModal = (order, type) => {
    setActiveOrder(order);
    setDecisionType(type);
    setStaffNotes(String(order?.staffNotes || '').trim());
    setEstimatedDeliveryDate(
      order?.deliveryInfo?.estimatedDeliveryDate ? String(order.deliveryInfo.estimatedDeliveryDate).slice(0, 10) : '',
    );
    setDeliveryAddress(coerceBusinessLocation(order?.deliveryInfo?.deliveryAddress) || '');
    setFinalPrice(order?.finalPrice != null ? String(order.finalPrice) : '');
    setRejectionReason('');
    setDecisionError('');
    setVendorImeSelection([]);
    setVendorImeRequired(false);
    setVendorCanFulfill(true);
  };

  const closeDecisionModal = () => {
    if (decisionBusyId) return;
    setActiveOrder(null);
    setDecisionType('');
    setDecisionError('');
    setVendorImeSelection([]);
    setVendorImeRequired(false);
    setVendorCanFulfill(true);
  };

  const submitDecision = async (e) => {
    e.preventDefault();
    const id = orderId(activeOrder);
    if (!id || !axiosPrivate || !currentUser?.id || !decisionType) return;

    const payload = { handledById: currentUser.id };
    const note = staffNotes.trim();

    if (decisionType === 'accept') {
      if (!note) {
        setDecisionError('Message to customer is required.');
        return;
      }
      const qty = Math.max(1, Number(activeOrder?.quantity) || 1);
      if (isVendorWebBuyOrder(activeOrder)) {
        if (!estimatedDeliveryDate.trim()) {
          setDecisionError('Expected delivery date is required for vendor site orders.');
          return;
        }
        if (!vendorCanFulfill) {
          setDecisionError('This order cannot be fulfilled from shop inventory. Request stock from a warehouse first.');
          return;
        }
        if (vendorImeRequired && vendorImeSelection.length !== qty) {
          setDecisionError(`Assign exactly ${qty} IME${qty === 1 ? '' : 's'} before confirming this sale.`);
          return;
        }
        if (vendorImeRequired) {
          payload.imeCodes = vendorImeSelection;
        }
      } else if (vendorImeRequired) {
        if (vendorImeSelection.length !== qty) {
          setDecisionError(`Assign exactly ${qty} IME${qty === 1 ? '' : 's'} before confirming this sale.`);
          return;
        }
        payload.imeCodes = vendorImeSelection;
      }
      payload.staffNotes = note;
      payload.estimatedDeliveryDate = estimatedDeliveryDate.trim();
      if (deliveryAddress.trim()) {
        payload.deliveryAddress = deliveryAddressPayloadForOrderAccept(deliveryAddress.trim());
      }
      const parsedFinalPrice = Number(finalPrice);
      if (finalPrice.trim() !== '' && Number.isFinite(parsedFinalPrice)) payload.finalPrice = parsedFinalPrice;
    } else {
      if (!rejectionReason.trim()) {
        setDecisionError('Rejection reason is required.');
        return;
      }
      payload.rejectionReason = rejectionReason.trim();
      if (note) payload.staffNotes = note;
    }

    setDecisionBusyId(id);
    setDecisionError('');
    try {
      if (decisionType === 'accept') {
        await patchOrderAccept(axiosPrivate, id, payload);
        if (isVendorWebBuyOrder(activeOrder)) {
          const receiptOrder = {
            ...activeOrder,
            status: 'accepted',
            handledAt: new Date().toISOString(),
            soldImeCodes: vendorImeSelection,
            directSale: {
              ...(activeOrder?.directSale || {}),
              type: 'wholesale',
              source: activeOrder?.directSale?.source || 'vendor_web',
              imeManifest: vendorImeSelection.map((ime) => ({
                ime,
                productName: orderProductName(activeOrder),
                brand: activeOrder?.productId?.brand || '',
                capacity: activeOrder?.productId?.capacity || '',
                color: activeOrder?.productId?.color || '',
                unitPrice: orderProductPrice(activeOrder),
              })),
            },
          };
          const receiptPayload = buildReceiptPayloadFromOrder(receiptOrder);
          try {
            printDirectSaleReceipt(receiptPayload);
          } catch (printErr) {
            console.warn('Receipt print failed:', printErr);
          }
          downloadVendorOrderReceiptPdf({
            ...receiptPayload,
            fileNameBase: `vendor-order-${orderId(activeOrder)}`,
          });
        }
      } else {
        await patchOrderReject(axiosPrivate, id, payload);
      }
      closeDecisionModal();
      await onOrdersReload?.();
      setStatusTab(decisionType === 'accept' ? 'accepted' : 'rejected');
    } catch (err) {
      setDecisionError(err?.response?.data?.message || err?.message || 'Failed to update order.');
    } finally {
      setDecisionBusyId('');
    }
  };

  const runDeleteOrder = async () => {
    const id = deleteConfirm?.id;
    if (!id || !axiosPrivate) {
      setDeleteConfirm(null);
      return;
    }
    if (deletingOrderId) return;
    setDeleteError('');
    setDeletingOrderId(id);
    try {
      await deleteOrder(axiosPrivate, id);
      setDeleteConfirm(null);
      await onOrdersReload?.();
    } catch (err) {
      setDeleteError(err?.response?.data?.message || err?.message || 'Failed to delete order.');
    } finally {
      setDeletingOrderId('');
    }
  };

  const downloadMonthPdf = () => {
    if (!selectedMonth) return;
    const monthLabel = selectedMonth === ORDERS_MONTH_ALL ? 'All time' : formatMonthLabel(selectedMonth);
    const kindLabel = !showTypeTabs
      ? 'All types'
      : orderKindTab === 'buy'
        ? 'Buy'
        : orderKindTab === 'direct'
          ? 'Direct (In-Shop)'
          : orderKindTab === 'offer'
            ? 'Offer'
            : 'Preorder';
    const statusLabel = lockStatusToAccepted
      ? 'Accepted'
      : statusTab === 'all'
        ? 'All statuses'
        : statusTab === 'received'
          ? 'Received'
          : statusTab === 'accepted'
            ? 'Accepted'
            : 'Rejected';
    const totalVisible = visibleOrders.reduce((s, o) => s + orderAmount(o), 0);

    downloadOrdersAsPdf({
      fileNameBase:
        selectedMonth === ORDERS_MONTH_ALL
          ? `${pdfFilePrefix}-all-${orderKindTab}-${statusTab}`
          : `${pdfFilePrefix}-${selectedMonth}-${orderKindTab}-${statusTab}`,
      titleLines: [
        'Wache — Orders',
        `Period: ${monthLabel} — ${kindLabel} — ${statusLabel}`,
        `Exported: ${new Date().toLocaleString()}`,
      ],
      columns: ['Order ID', 'Type', 'Product', 'Capacity', 'Business', 'Qty', 'Status', 'Amount', 'List price', 'Date'],
      rows: visibleOrders.map((o) => {
        const catalogProductPrice = orderProductPrice(o);
        return [
          orderDisplayCode(o) || '—',
          isDirectOrder(o) ? 'direct' : normalizeOrderKind(o),
          String(orderProductName(o)).slice(0, 48),
          String(orderProductCapacity(o) || '—').slice(0, 16),
          String(orderBusinessName(o)).slice(0, 32),
          String(orderEffectiveQuantity(o)),
          normalizeOrderStatus(o?.status),
          formatMoney(orderAmount(o)).replace(/\u202f/g, ' '),
          catalogProductPrice != null ? formatMoney(catalogProductPrice).replace(/\u202f/g, ' ') : '—',
          o?.createdAt ? new Date(o.createdAt).toLocaleDateString('en-GB') : '—',
        ];
      }),
      summaryLines: [
        `Row count: ${visibleOrders.length}`,
        `Sum of amounts (this view): ${formatMoney(totalVisible)}`,
      ],
    });
  };

  const orderKpiCards = [
    { id: 'all', icon: 'Σ', tone: 'all', label: 'All orders total', value: allTotal },
    { id: 'accepted', icon: '✓', tone: 'accepted', label: 'Accepted total', value: acceptedTotal },
    { id: 'rejected', icon: '✕', tone: 'rejected', label: 'Rejected total', value: rejectedTotal },
    { id: 'net', icon: '◎', tone: 'net', label: 'Net (all − rejected)', value: netMade },
  ];

  const monthLabel = selectedMonth === ORDERS_MONTH_ALL ? 'All time' : formatMonthLabel(selectedMonth);

  return (
    <div
      className={[
        'wh-dash-wrap',
        'admin-orders-wrap',
        singleTableVerticalScroll ? 'admin-orders-wrap--table-scroll-only' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <section className="wh-hero admin-orders-hero">
        <div className="wh-hero__inner">
          <p className="admin-orders-hero__eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {showHeroSummary ? (
            <p>
              {subtitle} Reporting period: {monthLabel.toLowerCase()}.
            </p>
          ) : null}
          <div className="admin-orders-hero__actions">
            {showHeroFilters ? (
              <>
                <label className="admin-orders-hero__month">
                  <span>Reporting period</span>
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                    {monthOptions.length === 0 ? <option value="">No data</option> : null}
                    {monthOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                {showShopFilter ? (
                  <label className="admin-orders-hero__month">
                    <span>Shop</span>
                    <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
                      <option value="">All shops</option>
                      {shopOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {showSalespersonFilter ? (
                  <label className="admin-orders-hero__month">
                    <span>Salesperson</span>
                    <select value={selectedSalesperson} onChange={(e) => setSelectedSalesperson(e.target.value)}>
                      <option value="">All salespersons</option>
                      {salespersonOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : null}
            <button type="button" className="wh-hero__btn admin-orders-hero__pdf" onClick={downloadMonthPdf} disabled={loading}>
              Download PDF
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <section className="admin-orders-state">
          <p>Loading orders…</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="admin-orders-state admin-orders-state--error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          {showCommissionSummary ? (
            <section className="admin-orders-commission" aria-label="Commission summary">
              <div className="admin-orders-commission__cards">
                <div className="admin-orders-commission__card">
                  <span className="admin-orders-commission__label">
                    {selectedSalesperson
                      ? `Salesperson commission (${selectedSalespersonLabel})`
                      : selectedShop
                        ? `Shop commission (${selectedShopLabel})`
                        : 'Monthly commission'}
                  </span>
                  <strong className="admin-orders-commission__value">
                    <MoneyXaf value={totalCommission} />
                  </strong>
                </div>
                {showTotalAmountMade ? (
                  <div className="admin-orders-commission__card admin-orders-commission__card--amount">
                    <span className="admin-orders-commission__label">{totalAmountLabel}</span>
                    <strong className="admin-orders-commission__value">
                      <MoneyXaf value={totalAmountMade} />
                    </strong>
                  </div>
                ) : null}
              </div>
              <p className="admin-orders-commission__hint">
                {totalUnitsSold} unit{totalUnitsSold === 1 ? '' : 's'} × <MoneyXaf value={commissionPerUnit} />
              </p>
            </section>
          ) : null}

          {showKpis ? (
            <div className="wh-status-row admin-orders-kpis" aria-label="Order totals">
              {orderKpiCards.map((card) => (
                <article key={card.id} className="wh-status-card">
                  <span className={`wh-status-card__icon wh-status-card__icon--${card.tone}`} aria-hidden>
                    {card.icon}
                  </span>
                  <div className="wh-status-card__body">
                    <span className="wh-status-card__label">{card.label}</span>
                    <span className="wh-status-card__value">
                      <MoneyXaf value={card.value} />
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}

          <section
            className={[
              'wh-panel',
              'admin-orders-panel',
              singleTableVerticalScroll ? 'admin-orders-panel--table-scroll-only' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {(showShopFilter || showSalespersonFilter) ? (
              <div className="admin-orders-report-filters">
                <div className="admin-orders-hero__actions">
                  <label className="admin-orders-hero__month">
                    <span>Month</span>
                    <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                      {monthOptions.length === 0 ? <option value="">No data</option> : null}
                      {monthOptions.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {showShopFilter ? (
                    <label className="admin-orders-hero__month">
                      <span>Shop</span>
                      <select value={selectedShop} onChange={(e) => setSelectedShop(e.target.value)}>
                        <option value="">All shops</option>
                        {shopOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {showSalespersonFilter ? (
                    <label className="admin-orders-hero__month">
                      <span>Salesperson</span>
                      <select value={selectedSalesperson} onChange={(e) => setSelectedSalesperson(e.target.value)}>
                        <option value="">All salespersons</option>
                        {salespersonOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="wh-section-head">
              <h3>Orders list</h3>
              <div className="admin-orders-panel__head-actions">
                <span className="wh-location-row__count">
                  {visibleOrders.length} row{visibleOrders.length === 1 ? '' : 's'}
                </span>
                <button type="button" className="admin-orders-pdf-btn" onClick={downloadMonthPdf} disabled={loading}>
                  Download PDF
                </button>
              </div>
            </div>

            {showTypeTabs ? (
              <div className="admin-orders-type-tabs" role="tablist" aria-label="Order types">
                {[
                  ['buy', `Buy (${buyCountMonth})`],
                  ['direct', `Direct (${directCountMonth})`],
                  ['offer', `Offer (${offerCountMonth})`],
                  ['preorder', `Preorders (${preorderCountMonth})`],
                ].map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="tab"
                    aria-selected={orderKindTab === kind}
                    className={`admin-orders-tab ${orderKindTab === kind ? 'is-active' : ''}`}
                    onClick={() => setOrderKindTab(kind)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            {showStatusTabs ? (
              <div className="admin-orders-status-tabs" role="tablist" aria-label="Order status">
                {[
                  ['all', `All (${typeFilteredMonthly.length})`],
                  ['received', `Received (${grouped.received.length})`],
                  ['accepted', `Accepted (${grouped.accepted.length})`],
                  ['rejected', `Rejected (${grouped.rejected.length})`],
                ].map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    role="tab"
                    aria-selected={statusTab === status}
                    className={`admin-orders-tab ${statusTab === status ? 'is-active' : ''}`}
                    onClick={() => setStatusTab(status)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}

            <div
              className={[
                'admin-orders-table-wrap',
                tableWrapClassName,
                singleTableVerticalScroll ? 'admin-orders-table-wrap--single-scroll' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <table className="wh-activity-table admin-orders-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Product</th>
                    <th>Capacity</th>
                    <th>Business</th>
                    <th>Address</th>
                    <th>Tel</th>
                    <th>WhatsApp</th>
                    <th>Qty</th>
                    <th>Status</th>
                    <th>Completed by</th>
                    <th className="fit-numeric-cell">List price</th>
                    <th className="fit-numeric-cell">Amount</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.length === 0 ? (
                    <tr>
                      <td colSpan={14}>No orders in this section for the selected month.</td>
                    </tr>
                  ) : (
                    visibleOrders.map((o) => {
                      const catalogProductPrice = orderProductPrice(o);
                      const oid = orderId(o);
                      const rowStatus = normalizeOrderStatus(o?.status);
                      const isReceivedRow = rowStatus === 'received';
                      return (
                        <tr key={oid || `${o.createdAt || ''}-${orderProductName(o)}`}>
                          <td>{orderDisplayCode(o)}</td>
                          <td>{orderProductName(o)}</td>
                          <td>{orderProductCapacity(o) || '—'}</td>
                          <td>{orderBusinessName(o)}</td>
                          <td>{orderBusinessAddress(o)}</td>
                          <td>{orderTel(o)}</td>
                          <td>{orderWhatsappNumber(o)}</td>
                          <td>{orderEffectiveQuantity(o)}</td>
                          <td>
                            <span className={`admin-orders-status-pill admin-orders-status-pill--${rowStatus}`}>
                              {rowStatus}
                            </span>
                          </td>
                          <td>{rowStatus === 'accepted' ? completedByLabel(o, currentUser) : '—'}</td>
                          <td className="fit-numeric-cell">
                            {catalogProductPrice != null ? <MoneyXaf value={catalogProductPrice} /> : '—'}
                          </td>
                          <td className="fit-numeric-cell">
                            <MoneyXaf value={orderAmount(o)} />
                          </td>
                          <td>{o?.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}</td>
                          <td>
                            <div className="admin-orders-actions">
                              {isReceivedRow ? (
                                <>
                                  <button
                                    type="button"
                                    className="admin-orders-action-btn admin-orders-action-btn--accept"
                                    onClick={() => openDecisionModal(o, 'accept')}
                                    disabled={decisionBusyId === oid || deletingOrderId === oid}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-orders-action-btn admin-orders-action-btn--reject"
                                    onClick={() => openDecisionModal(o, 'reject')}
                                    disabled={decisionBusyId === oid || deletingOrderId === oid}
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : null}
                              {showReceiptActions && rowStatus === 'accepted' ? (
                                <button
                                  type="button"
                                  className="admin-orders-action-btn admin-orders-action-btn--receipt"
                                  onClick={() => setReceiptOrder(o)}
                                  disabled={decisionBusyId === oid || deletingOrderId === oid}
                                >
                                  View receipt
                                </button>
                              ) : null}
                              {allowDelete ? (
                                <button
                                  type="button"
                                  className="admin-orders-action-btn admin-orders-action-btn--delete"
                                  onClick={() => {
                                    setDeleteError('');
                                    setDeleteConfirm({ id: oid, label: orderProductName(o) });
                                  }}
                                  disabled={decisionBusyId === oid || deletingOrderId === oid}
                                >
                                  Delete
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {allowDelete ? (
        <ConfirmDialog
          open={Boolean(deleteConfirm)}
          title="Delete order?"
          message={
            deleteConfirm ? (
              <>
                <p>
                  Permanently delete order <strong>{String(deleteConfirm.id).slice(0, 10)}…</strong>
                  {deleteConfirm.label ? ` — ${deleteConfirm.label}` : ''}? This cannot be undone.
                </p>
                {deleteError ? <p className="admin-orders-modal-error">{deleteError}</p> : null}
              </>
            ) : (
              ''
            )
          }
          cancelLabel="Cancel"
          confirmLabel={deletingOrderId ? 'Deleting…' : 'Delete'}
          danger
          onCancel={() => {
            setDeleteConfirm(null);
            setDeleteError('');
          }}
          onConfirm={runDeleteOrder}
        />
      ) : null}

      {activeOrder ? (
        <div className="admin-orders-modal-overlay" role="presentation" onClick={closeDecisionModal}>
          <div
            className="admin-orders-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orders-decision-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="orders-decision-title">{decisionType === 'accept' ? 'Accept Order' : 'Reject Order'}</h2>
            <p className="admin-orders-modal-sub">
              {orderProductName(activeOrder)} — Qty {Math.max(1, Number(activeOrder?.quantity) || 1)}
            </p>
            <form className="admin-orders-modal-form" onSubmit={submitDecision}>
              {decisionType === 'accept' ? (
                <>
                  <VendorOrderImeAcceptFields
                    order={activeOrder}
                    axiosPrivate={axiosPrivate}
                    selectedImes={vendorImeSelection}
                    onSelectedImesChange={setVendorImeSelection}
                    onRequiresImesChange={setVendorImeRequired}
                    onCanFulfillChange={setVendorCanFulfill}
                  />
                  <label>
                    Message to customer
                    <textarea
                      rows={3}
                      value={staffNotes}
                      onChange={(e) => setStaffNotes(e.target.value)}
                      placeholder="Your order is accepted and being prepared."
                      required
                    />
                  </label>
                  <label>
                    Expected delivery date
                    {isVendorWebBuyOrder(activeOrder) ? ' (required)' : ' (optional)'}
                    <input
                      type="date"
                      value={estimatedDeliveryDate}
                      onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
                      required={isVendorWebBuyOrder(activeOrder)}
                    />
                  </label>
                  <label>
                    Delivery city (optional)
                    <BusinessLocationSelect
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      mode="optional"
                      emptyOptionLabel="— None —"
                    />
                  </label>
                  <label>
                    Final price (optional)
                    <input
                      type="number"
                      min="0"
                      value={finalPrice}
                      onChange={(e) => setFinalPrice(e.target.value)}
                      placeholder="Use this for negotiated orders"
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Rejection reason
                    <input
                      type="text"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Reason sent to customer"
                      required
                    />
                  </label>
                  <label>
                    Additional note (optional)
                    <textarea
                      rows={3}
                      value={staffNotes}
                      onChange={(e) => setStaffNotes(e.target.value)}
                      placeholder="Optional follow-up note"
                    />
                  </label>
                </>
              )}
              {decisionError ? <p className="admin-orders-modal-error">{decisionError}</p> : null}
              <div className="admin-orders-modal-actions">
                <button type="button" className="admin-orders-modal-btn admin-orders-modal-btn--ghost" onClick={closeDecisionModal}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`admin-orders-modal-btn ${decisionType === 'accept' ? 'admin-orders-modal-btn--accept' : 'admin-orders-modal-btn--reject'}`}
                  disabled={
                    decisionBusyId === orderId(activeOrder)
                    || (decisionType === 'accept'
                      && isVendorWebBuyOrder(activeOrder)
                      && !vendorCanFulfill)
                  }
                >
                  {decisionBusyId === orderId(activeOrder)
                    ? decisionType === 'accept'
                      ? 'Accepting...'
                      : 'Rejecting...'
                    : decisionType === 'accept'
                      ? isVendorWebBuyOrder(activeOrder) && !vendorCanFulfill
                        ? 'Request warehouse stock'
                        : vendorImeRequired
                          ? 'Confirm sale & receipt'
                          : 'Accept & Send'
                      : 'Reject & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <OrderReceiptModal
        open={Boolean(receiptOrder)}
        order={receiptOrder}
        axiosPrivate={axiosPrivate}
        onClose={() => setReceiptOrder(null)}
        onSaved={(updated) => {
          if (!updated) return;
          onOrderUpdated?.(updated);
          setReceiptOrder(updated);
        }}
      />
    </div>
  );
}
