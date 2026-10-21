import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import AccountsPanel from '../components/admin/AccountsPanel';
import SettingsPanel from '../components/admin/SettingsPanel';
import ExpensesPanel from '../components/shared/ExpensesPanel';
import CreateSalesmanForm from '../components/admin/CreateSalesmanForm';
import AddInventoryPanel from '../components/admin/AddInventoryPanel';
import useAdminAccountRegion from '../hooks/useAdminAccountRegion';
import DirectSalePanel from '../components/admin/DirectSalePanel';
import EditProductModal from '../components/admin/EditProductModal';
import WarehousesPanel from '../components/admin/WarehousesPanel';
import WarehouseGridDashboard from '../components/admin/WarehouseGridDashboard';
import AdminOverviewDashboard from '../components/admin/AdminOverviewDashboard';
import SalesReportsPanel from '../components/admin/SalesReportsPanel';
import { markProductArrived } from '../api/warehouseApi';
import { fetchBulkShipments, markBulkShipmentArrived } from '../api/bulkShipmentApi';
import { deleteProductById, fetchAdminInventoryProducts, fetchOrdersList, fetchSoldOutInventory, fetchStaffList, fetchWholesalers, lookupInventoryByIme } from '../api/adminApi';
import { normalizeProductRecord } from '../api/productsApi';
import { notifyProductCatalogUpdated } from '../utils/productCatalogEvents';
import { deleteOrder, fetchPendingOfferOrders, patchOrderAccept, patchOrderReject } from '../api/ordersListApi';
import { subscribeOrderCreated } from '../utils/orderCreatedEvents';
import { subscribeProductCatalogUpdated } from '../utils/productCatalogEvents';
import { formatTitleCase } from '../utils/formatProductName';
import useAuth from '../hooks/useAuth';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import useLocalStorage from '../hooks/useLocalStorage';
import useDashboardTab from '../hooks/useDashboardTab';
import BrandLogo from '../components/BrandLogo';
import { ConfirmDialog } from '../components/AppDialog';
import BusinessLocationSelect from '../components/BusinessLocationSelect';
import { coerceBusinessLocation, deliveryAddressPayloadForOrderAccept } from '../data/businessLocations';
import { isTunneledPreorderOrder } from '../constants/preorderOrderTunnel';
import { formatMonthLabel } from '../utils/orderMonthUtils';
import { downloadOrdersAsPdf } from '../utils/ordersMonthlyPdf';
import {
  orderAmount,
  orderDisplayDate,
  orderMonthKey,
  orderSalespersonRef,
  orderShopRef,
  orderVisibleInShopList,
  normalizeOrderStatus,
} from '../utils/orderDisplay';
import {
  filterMergedInventory,
  formatInventoryCapacities,
  inventoryColorOptions,
  inventoryProductKey,
  inventoryMergedRowHasMultipleProductDocs,
  inventoryProductLineDetailRows,
  mergeInventoryProducts,
  pickInventoryLocation,
  inventoryRowKey,
  pickInventoryCapacityVariant,
} from '../utils/mergeInventoryProducts';
import InventoryFilters from '../components/sales/InventoryFilters';
import { bulkBatchTravelRoute, productLocationDisplay, productTravelRoute } from '../utils/productTravelRoute';
import ProductTravelRoute from '../components/shared/ProductTravelRoute';
import InventoryImeLookup from '../components/admin/InventoryImeLookup';
import InventorySoldOutPanel from '../components/admin/InventorySoldOutPanel';
import InventoryMissingPhotosPanel from '../components/admin/InventoryMissingPhotosPanel';
import InventoryMissingPricingPanel from '../components/admin/InventoryMissingPricingPanel';
import InventoryImeCell from '../components/admin/InventoryImeCell';
import InventoryColorCell from '../components/admin/InventoryColorCell';
import InventoryProductNameCell from '../components/admin/InventoryProductNameCell';
import useInventoryRowExpansion from '../hooks/useInventoryRowExpansion';
import { fetchPricingCatalog } from '../api/pricingApi';
import { buildPricingCatalogLookup, resolveInventoryPricing } from '../utils/inventoryPricingDisplay';
import { countInventoryUnits, inventoryRowImeCodes, inventoryRowUnitCount, inventoryUnitDetailRows, normalizedImeList, resolveEffectiveLineStock, sumMergedInventoryUnits } from '../utils/productIme';
import './AdminDashboard.css';

const ADMIN_TAB_IDS = [
  'dashboard',
  'warehouses',
  'shops',
  'orders',
  'inventory',
  'direct-sale',
  'sales',
  'accounts',
  'business-cities',
  'expenses',
  'reports',
  'analytics',
  'warehouses-setup',
  'shops-setup',
  'add',
];
import '../components/shared/ProductTravelRoute.css';
import '../components/admin/WarehousesPanel.css';
import '../components/admin/WarehouseDashboard.css';
import '../components/admin/InventoryPanel.css';
import '../components/admin/AdminOrdersPanel.css';
import '../components/sales/InventoryFilters.css';

/** Admin orders month filter: show every loaded order */
const ORDERS_MONTH_ALL = '__all__';

import MoneyXaf from '../components/MoneyXaf';
import { formatMoneyXaf } from '../utils/formatMoneyXaf';
import { formatBatteryHealthLabel, formatInventoryBatteryHealth } from '../utils/batteryHealth';

const formatMoney = formatMoneyXaf;

function formatPct(v) {
  const n = Number(v || 0);
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function upperText(v) {
  if (v == null || v === '') return '—';
  return formatTitleCase(v, '—');
}

function orderId(o) {
  return String(o?._id ?? o?.id ?? '');
}

function orderProductName(o) {
  return o?.productName || o?.productId?.product_name || o?.product?.product_name || 'Product';
}

function orderBusinessName(o) {
  return o?.businessName || o?.userId?.businessName || '—';
}

function orderBusinessAddress(o) {
  return o?.businessAddress || o?.userId?.businessAddress || o?.userId?.deliveryAddress || '—';
}

/** @returns {'buy' | 'offer' | 'preorder'} */
function normalizeOrderKind(o) {
  const t = String(o?.orderType ?? o?.type ?? '').toLowerCase().trim();
  if (t === 'preorder') return 'preorder';
  if (t === 'offer' && isTunneledPreorderOrder(o)) return 'preorder';
  if (t === 'offer') return 'offer';
  return 'buy';
}

/** In-store direct sale from `DirectSalePanel` / `createAndConfirmDirectBuy` */
function isDirectOrder(o) {
  const u = String(o?.userNotes || '');
  if (/\[Direct sale\s*[—-]\s*in-Shop\]/i.test(u) || /\[Direct sale\s*[—-]\s*in-store\]/i.test(u)) return true;
  const staff = String(o?.staffNotes || '');
  if (staff.includes('Direct In-Shop sale') || staff.includes('Direct in-store sale')) return true;
  const src = String(o?.metadata?.source ?? '').toLowerCase().trim();
  if (src === 'direct' || src === 'direct_sale' || src === 'in_store') return true;
  return false;
}

/** Catalog / list price stored on the order or populated product (from API). */
function orderProductPrice(order) {
  const n = Number(
    order?.productPrice ??
      order?.product_price ??
      order?.product?.price ??
      order?.productId?.price ??
      NaN,
  );
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function completedByLabel(order, currentUser) {
  const by =
    order?.handledBy?.name ||
    order?.handledByName ||
    order?.approvedByName ||
    order?.completedByName ||
    '';
  if (by) return String(by);

  const handledById = String(order?.handledBy?._id || order?.handledBy || order?.handledById || '').trim();
  if (handledById && currentUser?.id && handledById === String(currentUser.id)) {
    return currentUser.name || 'You';
  }
  if (handledById) return `Staff (${handledById.slice(0, 8)})`;
  return 'Not specified';
}

function OrdersPanel({ orders = [], loading, error, currentUser, axiosPrivate, onOrdersReload }) {
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
  const [selectedShopFilter, setSelectedShopFilter] = useState('');
  const [selectedSalespersonFilter, setSelectedSalespersonFilter] = useState('');

  const monthOptions = useMemo(() => {
    const map = new Map();
    orders.forEach((o) => {
      const key = orderMonthKey(o);
      if (!key) return;
      map.set(key, formatMonthLabel(key));
    });
    const rest = [...map.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
    return [{ value: ORDERS_MONTH_ALL, label: 'All time' }, ...rest];
  }, [orders]);

  useEffect(() => {
    if (monthOptions.some((m) => m.value === selectedMonth)) return;
    setSelectedMonth(ORDERS_MONTH_ALL);
  }, [monthOptions, selectedMonth]);

  const monthlyOrders = useMemo(() => {
    if (selectedMonth === ORDERS_MONTH_ALL || !selectedMonth) return orders;
    return orders.filter((o) => orderMonthKey(o) === selectedMonth);
  }, [orders, selectedMonth]);

  const shopFilterOptions = useMemo(() => {
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
  }, [monthlyOrders]);

  const salespersonFilterOptions = useMemo(() => {
    const map = new Map();
    monthlyOrders.forEach((order) => {
      const staff = orderSalespersonRef(order);
      if (!staff.key) return;
      if (!map.has(staff.key)) {
        map.set(staff.key, { value: staff.key, label: staff.name || 'Staff' });
      }
    });
    return [...map.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [monthlyOrders]);

  const scopedMonthlyOrders = useMemo(
    () =>
      monthlyOrders.filter((order) => {
        if (selectedShopFilter) {
          const shop = orderShopRef(order);
          if (shop.key !== selectedShopFilter) return false;
        }
        if (selectedSalespersonFilter) {
          const staff = orderSalespersonRef(order);
          if (staff.key !== selectedSalespersonFilter) return false;
        }
        return true;
      }),
    [monthlyOrders, selectedSalespersonFilter, selectedShopFilter],
  );

  const buyCountMonth = useMemo(
    () =>
      scopedMonthlyOrders.filter((o) => normalizeOrderKind(o) === 'buy' && !isDirectOrder(o)).length,
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

  const typeFilteredMonthly = useMemo(() => {
    if (orderKindTab === 'direct') return scopedMonthlyOrders.filter((o) => isDirectOrder(o));
    return scopedMonthlyOrders.filter((o) => {
      if (normalizeOrderKind(o) !== orderKindTab) return false;
      if (orderKindTab === 'buy' && isDirectOrder(o)) return false;
      return true;
    });
  }, [scopedMonthlyOrders, orderKindTab]);

  const grouped = useMemo(() => {
    const g = { received: [], accepted: [], rejected: [] };
    typeFilteredMonthly.forEach((o) => {
      g[normalizeOrderStatus(o?.status)].push(o);
    });
    return g;
  }, [typeFilteredMonthly]);

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
    if (statusTab === 'all') return typeFilteredMonthly;
    return grouped[statusTab] || [];
  }, [grouped, typeFilteredMonthly, statusTab]);

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
  };

  const closeDecisionModal = () => {
    if (decisionBusyId) return;
    setActiveOrder(null);
    setDecisionType('');
    setDecisionError('');
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
      payload.staffNotes = note;
      if (estimatedDeliveryDate.trim()) payload.estimatedDeliveryDate = estimatedDeliveryDate.trim();
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
      if (decisionType === 'accept') await patchOrderAccept(axiosPrivate, id, payload);
      else await patchOrderReject(axiosPrivate, id, payload);
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
    const monthLabel =
      selectedMonth === ORDERS_MONTH_ALL ? 'All time' : formatMonthLabel(selectedMonth);
    const kindLabel =
      orderKindTab === 'buy'
        ? 'Buy'
        : orderKindTab === 'direct'
          ? 'Direct (In-Shop)'
          : orderKindTab === 'offer'
            ? 'Offer'
            : 'Preorder';
    const statusLabel =
      statusTab === 'all'
        ? 'All statuses'
        : statusTab === 'received'
          ? 'Received'
          : statusTab === 'accepted'
            ? 'Accepted'
            : 'Rejected';
    const totalVisible = visibleOrders.reduce((s, o) => s + orderAmount(o), 0);

    const columns = [
      'Order ID',
      'Type',
      'Product',
      'Business',
      'Qty',
      'Status',
      'Amount',
      'List price',
      'Date',
    ];

    const rows = visibleOrders.map((o) => {
      const catalogProductPrice = orderProductPrice(o);
      return [
        orderId(o).slice(0, 12) || '—',
        isDirectOrder(o) ? 'direct' : normalizeOrderKind(o),
        String(orderProductName(o)).slice(0, 48),
        String(orderBusinessName(o)).slice(0, 32),
        String(Math.max(1, Number(o?.quantity) || 1)),
        normalizeOrderStatus(o?.status),
        formatMoney(orderAmount(o)).replace(/\u202f/g, ' '),
        catalogProductPrice != null ? formatMoney(catalogProductPrice).replace(/\u202f/g, ' ') : '—',
        orderDisplayDate(o),
      ];
    });

    downloadOrdersAsPdf({
      fileNameBase:
        selectedMonth === ORDERS_MONTH_ALL
          ? `wache-admin-orders-all-${orderKindTab}-${statusTab}`
          : `wache-admin-orders-${selectedMonth}-${orderKindTab}-${statusTab}`,
      titleLines: [
        'Wache vendor — Orders',
        `Period: ${monthLabel} — ${kindLabel} — ${statusLabel}`,
        `Exported: ${new Date().toLocaleString()}`,
      ],
      columns,
      rows,
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

  const monthLabel =
    selectedMonth === ORDERS_MONTH_ALL ? 'All time' : formatMonthLabel(selectedMonth);

  return (
    <div className="wh-dash-wrap wh-inventory-wrap admin-orders-wrap">
      <div className="wh-inventory-main">
      <section className="wh-hero admin-orders-hero">
        <div className="wh-hero__inner">
          <p className="admin-orders-hero__eyebrow">Order management</p>
          <h2>Review &amp; fulfill wholesale orders</h2>
          <p>
            Accept or reject buy, direct, offer, and preorder requests. Filter by month and track
            revenue for {monthLabel.toLowerCase()}.
          </p>
          <div className="admin-orders-hero__actions">
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
            <button
              type="button"
              className="wh-hero__btn admin-orders-hero__pdf"
              onClick={downloadMonthPdf}
              disabled={loading}
            >
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
          <div className="wh-status-row admin-orders-kpis" aria-label="Order totals">
            {orderKpiCards.map((card) => (
              <article key={card.id} className="wh-status-card">
                <span
                  className={`wh-status-card__icon wh-status-card__icon--${card.tone}`}
                  aria-hidden
                >
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

          <section className="wh-panel">
            <div className="wh-section-head">
              <h3>Orders list</h3>
              <span className="wh-location-row__count">
                {visibleOrders.length} row{visibleOrders.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="inventory-filters admin-orders-filters">
              <label className="inventory-filters__field">
                <span className="inventory-filters__label">Shop</span>
                <select
                  className="inventory-filters__select"
                  value={selectedShopFilter}
                  onChange={(e) => setSelectedShopFilter(e.target.value)}
                  aria-label="Filter orders by shop"
                >
                  <option value="">All shops</option>
                  {shopFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="inventory-filters__field">
                <span className="inventory-filters__label">Salesperson</span>
                <select
                  className="inventory-filters__select"
                  value={selectedSalespersonFilter}
                  onChange={(e) => setSelectedSalespersonFilter(e.target.value)}
                  aria-label="Filter orders by salesperson"
                >
                  <option value="">All salespersons</option>
                  {salespersonFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="admin-orders-panel__toolbar">
              <button
                type="button"
                className="admin-orders-pdf-btn"
                onClick={downloadMonthPdf}
                disabled={loading}
                aria-label="Download orders table as PDF"
              >
                Download PDF
              </button>
            </div>

            <div className="admin-orders-type-tabs" role="tablist" aria-label="Order types">
              <button
                type="button"
                role="tab"
                aria-selected={orderKindTab === 'buy'}
                className={`admin-orders-tab ${orderKindTab === 'buy' ? 'is-active' : ''}`}
                onClick={() => setOrderKindTab('buy')}
              >
                Buy ({buyCountMonth})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={orderKindTab === 'direct'}
                className={`admin-orders-tab ${orderKindTab === 'direct' ? 'is-active' : ''}`}
                onClick={() => setOrderKindTab('direct')}
              >
                Direct ({directCountMonth})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={orderKindTab === 'offer'}
                className={`admin-orders-tab ${orderKindTab === 'offer' ? 'is-active' : ''}`}
                onClick={() => setOrderKindTab('offer')}
              >
                Offer ({offerCountMonth})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={orderKindTab === 'preorder'}
                className={`admin-orders-tab ${orderKindTab === 'preorder' ? 'is-active' : ''}`}
                onClick={() => setOrderKindTab('preorder')}
              >
                Preorders ({preorderCountMonth})
              </button>
            </div>

            <div className="admin-orders-status-tabs" role="tablist" aria-label="Order status">
              <button
                type="button"
                role="tab"
                aria-selected={statusTab === 'all'}
                className={`admin-orders-tab ${statusTab === 'all' ? 'is-active' : ''}`}
                onClick={() => setStatusTab('all')}
              >
                All ({typeFilteredMonthly.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={statusTab === 'received'}
                className={`admin-orders-tab ${statusTab === 'received' ? 'is-active' : ''}`}
                onClick={() => setStatusTab('received')}
              >
                Received ({grouped.received.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={statusTab === 'accepted'}
                className={`admin-orders-tab ${statusTab === 'accepted' ? 'is-active' : ''}`}
                onClick={() => setStatusTab('accepted')}
              >
                Accepted ({grouped.accepted.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={statusTab === 'rejected'}
                className={`admin-orders-tab ${statusTab === 'rejected' ? 'is-active' : ''}`}
                onClick={() => setStatusTab('rejected')}
              >
                Rejected ({grouped.rejected.length})
              </button>
            </div>

            {visibleOrders.length === 0 ? (
              <p className="wh-empty">No orders in this section for the selected month.</p>
            ) : (
            <div className="wh-inventory-table-wrap inventory-table-viewport">
              <table className="wh-activity-table wh-inventory-table admin-orders-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product</th>
                    <th>Business</th>
                    <th>Address</th>
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
                  {visibleOrders.map((o, rowIndex) => {
                      const catalogProductPrice = orderProductPrice(o);
                      const oid = orderId(o);
                      const rowStatus = normalizeOrderStatus(o?.status);
                      const isReceivedRow = rowStatus === 'received';
                      return (
                        <tr key={oid || `${o.createdAt || ''}-${orderProductName(o)}`}>
                          <td>{rowIndex + 1}</td>
                          <td>{orderProductName(o)}</td>
                          <td>{orderBusinessName(o)}</td>
                          <td>{orderBusinessAddress(o)}</td>
                          <td>{Math.max(1, Number(o?.quantity) || 1)}</td>
                          <td>
                            <span
                              className={`admin-orders-status-pill admin-orders-status-pill--${rowStatus}`}
                            >
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
                          <td className="admin-orders-table__date">{orderDisplayDate(o)}</td>
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
                              <button
                                type="button"
                                className="admin-orders-action-btn admin-orders-action-btn--delete"
                                onClick={() => {
                                  setDeleteError('');
                                  setDeleteConfirm({
                                    id: oid,
                                    label: orderProductName(o),
                                  });
                                }}
                                disabled={decisionBusyId === oid || deletingOrderId === oid}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </section>
        </>
      ) : null}
      </div>

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

      {activeOrder && (
        <div className="admin-orders-modal-overlay" role="presentation" onClick={closeDecisionModal}>
          <div
            className="admin-orders-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="orders-decision-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="orders-decision-title">
              {decisionType === 'accept' ? 'Accept Order' : 'Reject Order'}
            </h2>
            <p className="admin-orders-modal-sub">
              {orderProductName(activeOrder)} — Qty {Math.max(1, Number(activeOrder?.quantity) || 1)}
            </p>
            <form className="admin-orders-modal-form" onSubmit={submitDecision}>
              {decisionType === 'accept' ? (
                <>
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
                    Estimated delivery date (optional)
                    <input
                      type="date"
                      value={estimatedDeliveryDate}
                      onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
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
                <button
                  type="button"
                  className="admin-orders-modal-btn admin-orders-modal-btn--ghost"
                  onClick={closeDecisionModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`admin-orders-modal-btn ${decisionType === 'accept' ? 'admin-orders-modal-btn--accept' : 'admin-orders-modal-btn--reject'}`}
                  disabled={decisionBusyId === orderId(activeOrder)}
                >
                  {decisionBusyId === orderId(activeOrder)
                    ? (decisionType === 'accept' ? 'Accepting...' : 'Rejecting...')
                    : (decisionType === 'accept' ? 'Accept & Send' : 'Reject & Send')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function productShipmentStatus(p) {
  const s = String(p?.shipmentStatus || 'arrived').toLowerCase();
  return s === 'travelling' ? 'travelling' : 'arrived';
}

function InventoryPanel({ products = [], loading, error, onDeleteProduct, reloadProducts, onGoToDirectSalePricing }) {
  const axiosPrivate = useAxiosPrivate();
  const [categoryTab, setCategoryTab] = useState('total-products');
  const [editProduct, setEditProduct] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [arrivingId, setArrivingId] = useState('');
  const [bulkShipments, setBulkShipments] = useState([]);
  const [bulkShipmentsLoading, setBulkShipmentsLoading] = useState(false);
  const [arrivingBatchId, setArrivingBatchId] = useState('');
  const [missingPhotosOpen, setMissingPhotosOpen] = useState(false);
  const [missingPricingOpen, setMissingPricingOpen] = useState(false);
  const [pricingCatalog, setPricingCatalog] = useState([]);
  const [pricingCatalogLoading, setPricingCatalogLoading] = useState(true);
  const [soldOutTotal, setSoldOutTotal] = useState(null);
  const [inventoryNameFilter, setInventoryNameFilter] = useState('');
  const [inventoryCapacityFilter, setInventoryCapacityFilter] = useState('');
  const {
    inlineStoragePickerKey,
    expandedStorageSelection,
    hideStockColorColumns,
    handleProductSelect: handleInventoryProductSelect,
    handleStorageSelect: handleInventoryStorageSelect,
  } = useInventoryRowExpansion();

  useEffect(() => {
    let cancelled = false;
    fetchSoldOutInventory(axiosPrivate, { limit: 1 })
      .then((body) => {
        if (!cancelled) setSoldOutTotal(body.total ?? 0);
      })
      .catch(() => {
        if (!cancelled) setSoldOutTotal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  useEffect(() => {
    let cancelled = false;
    setPricingCatalogLoading(true);
    fetchPricingCatalog(axiosPrivate)
      .then((rows) => {
        if (!cancelled) setPricingCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setPricingCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setPricingCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate]);

  const clearInventoryFilters = () => {
    setInventoryNameFilter('');
    setInventoryCapacityFilter('');
  };

  const handleInventoryNameFilterChange = (name) => {
    if (!String(name || '').trim()) {
      clearInventoryFilters();
      return;
    }
    setInventoryNameFilter(name);
    setInventoryCapacityFilter('');
  };

  const handleInventoryCapacityFilterChange = (capacity) => {
    const cap = String(capacity || '').trim();
    setInventoryCapacityFilter(cap);
  };

  const pricingLookup = useMemo(
    () => buildPricingCatalogLookup(pricingCatalog),
    [pricingCatalog],
  );

  useEffect(() => {
    if (categoryTab !== 'travelling') return undefined;
    let cancelled = false;
    (async () => {
      setBulkShipmentsLoading(true);
      try {
        const rows = await fetchBulkShipments(axiosPrivate, { status: 'travelling' });
        if (!cancelled) setBulkShipments(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setBulkShipments([]);
      } finally {
        if (!cancelled) setBulkShipmentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate, categoryTab, products]);

  const sortedByNewest = useMemo(() => {
    const rows = [...products];
    rows.sort((a, b) => {
      const aTs = new Date(a?.releaseDate || a?.releasedAt || a?.createdAt || a?.updatedAt || 0).getTime() || 0;
      const bTs = new Date(b?.releaseDate || b?.releasedAt || b?.createdAt || b?.updatedAt || 0).getTime() || 0;
      return bTs - aTs;
    });
    return rows;
  }, [products]);

  const groups = useMemo(() => {
    const inStock = sortedByNewest.filter((p) => resolveEffectiveLineStock(p) > 0);
    const lowStock = sortedByNewest.filter((p) => {
      const units = resolveEffectiveLineStock(p);
      return units > 0 && units < 10;
    });
    const travelling = sortedByNewest.filter((p) => productShipmentStatus(p) === 'travelling');
    return {
      'total-products': mergeInventoryProducts(products),
      'in-stock': mergeInventoryProducts(inStock),
      'low-stock': mergeInventoryProducts(lowStock),
      travelling: mergeInventoryProducts(travelling),
    };
  }, [sortedByNewest, products]);

  const visible = groups[categoryTab] || [];
  const visibleWithIme = useMemo(
    () => visible.filter((row) => inventoryRowImeCodes(row).length > 0),
    [visible],
  );

  const filteredVisible = useMemo(
    () =>
      filterMergedInventory(visibleWithIme, {
        nameQuery: inventoryNameFilter,
        capacity: inventoryCapacityFilter,
        expandWithoutCapacity: false,
      }),
    [visibleWithIme, inventoryNameFilter, inventoryCapacityFilter],
  );
  const modelSortedVisible = useMemo(() => {
    const rows = [...filteredVisible];
    rows.sort((a, b) => {
      const nameA = String(a?.product_name || '').trim();
      const nameB = String(b?.product_name || '').trim();
      const byName = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      if (byName !== 0) return byName;
      const brandA = String(a?.brand || '').trim();
      const brandB = String(b?.brand || '').trim();
      const byBrand = brandA.localeCompare(brandB, undefined, { sensitivity: 'base' });
      if (byBrand !== 0) return byBrand;
      return String(a?.capacity || '').localeCompare(String(b?.capacity || ''), undefined, {
        sensitivity: 'base',
      });
    });
    return rows;
  }, [filteredVisible]);

  const categoryUnitTotals = useMemo(
    () => ({
      'in-stock': sumMergedInventoryUnits(groups['in-stock']),
      'low-stock': sumMergedInventoryUnits(groups['low-stock']),
      travelling: sumMergedInventoryUnits(groups.travelling),
    }),
    [groups],
  );

  /** Product rows in the inventory table (same set as the table body, before name/capacity filters). */
  const totalProductRowCount = useMemo(() => {
    const rows = groups['total-products'] || [];
    return rows.filter((row) => inventoryRowImeCodes(row).length > 0).length;
  }, [groups]);

  const platformTotalUnits = useMemo(() => countInventoryUnits(products), [products]);

  const platformProductLines = useMemo(() => mergeInventoryProducts(products).length, [products]);

  const openDeleteConfirm = (id, productNameHint = '') => {
    const key = String(id || '').trim();
    if (!key || !onDeleteProduct) return;
    let name = productNameHint || '';
    if (!name) {
      for (const row of visible) {
        const locations = Array.isArray(row?.locations) ? row.locations : [];
        const hit = locations.find((loc) => loc.productId === key);
        if (hit?.product?.product_name) {
          name = hit.product.product_name;
          break;
        }
        if (String(row?._id ?? row?.id ?? '') === key) {
          name = row?.product_name || '';
          break;
        }
      }
    }
    const label = name ? `"${String(name).slice(0, 80)}"` : 'this product';
    setDeleteConfirm({ id: key, label });
  };

  const runDeleteProduct = async () => {
    const key = deleteConfirm?.id;
    if (!key || !onDeleteProduct) {
      setDeleteConfirm(null);
      return;
    }
    setDeleteConfirm(null);
    setDeletingId(key);
    setActionMessage('');
    try {
      await onDeleteProduct(key);
      setActionMessage('Product deleted successfully.');
    } catch (err) {
      const msg =
        (typeof err?.response?.data === 'string' && err.response.data) ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete product.';
      setActionMessage(String(msg));
    } finally {
      setDeletingId(null);
    }
  };

  const handleMarkArrived = async (id) => {
    const key = String(id || '').trim();
    if (!key) return;
    setArrivingId(key);
    setActionMessage('');
    try {
      await markProductArrived(axiosPrivate, key);
      notifyProductCatalogUpdated();
      await reloadProducts?.();
      setActionMessage('Product marked as arrived at its Shop.');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to mark product as arrived.';
      setActionMessage(String(msg));
    } finally {
      setArrivingId('');
    }
  };

  const handleMarkBatchDelivered = async (shipment) => {
    const batchKey =
      String(shipment?.batchCode || shipment?._id || shipment?.id || '').trim();
    if (!batchKey) return;
    setArrivingBatchId(batchKey);
    setActionMessage('');
    try {
      const res = await markBulkShipmentArrived(axiosPrivate, batchKey);
      notifyProductCatalogUpdated();
      await reloadProducts?.();
      const payload = res?.data ?? res;
      const count = payload?.updatedCount ?? shipment?.productCount ?? 0;
      const msg =
        res?.message ||
        (payload?.receivedAtMain
          ? `Batch ${batchKey}: ${count} product(s) marked as received at the main warehouse.`
          : count
            ? `Batch ${batchKey}: ${count} product(s) delivered to the Shop.`
            : `Batch ${batchKey} updated.`);
      setActionMessage(msg);
      setBulkShipments((prev) => prev.filter((s) => String(s?.batchCode || s?._id) !== batchKey));
    } catch (err) {
      const msg =
        err?.response?.data?.message || err?.message || 'Failed to mark bulk batch as delivered.';
      setActionMessage(String(msg));
    } finally {
      setArrivingBatchId('');
    }
  };

  const inventoryCategories = [
    {
      id: 'total-products',
      label: 'Total product',
      icon: '📋',
      iconClass: 'wh-status-card__icon--request',
      sub: 'Products in inventory table',
      countKind: 'rows',
    },
    {
      id: 'in-stock',
      label: 'In stock',
      icon: '📦',
      iconClass: 'wh-status-card__icon--stock',
      sub: 'Units available now',
      countKind: 'units',
    },
    {
      id: 'low-stock',
      label: 'Low / out',
      icon: '⚠️',
      iconClass: 'wh-status-card__icon--travel',
      sub: 'Below 10 units',
      countKind: 'units',
    },
    {
      id: 'travelling',
      label: 'Travelling',
      icon: '🚚',
      iconClass: 'wh-status-card__icon--travel',
      sub: 'In transit to location',
      countKind: 'units',
    },
    {
      id: 'sold-out',
      label: 'Sold out',
      icon: '🏷️',
      iconClass: 'wh-status-card__icon--sold',
      sub: 'Units sold via direct sale',
      countKind: 'units',
    },
  ];

  return (
    <div className="wh-dash-wrap wh-inventory-wrap">
      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title="Delete product?"
        message={
          deleteConfirm ? (
            <p>
              Delete {deleteConfirm.label} permanently? This cannot be undone.
            </p>
          ) : (
            ''
          )
        }
        cancelLabel="Cancel"
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={runDeleteProduct}
      />
      <EditProductModal
        product={editProduct}
        onClose={() => setEditProduct(null)}
        onSaved={async () => {
          notifyProductCatalogUpdated();
          try {
            await reloadProducts?.();
          } catch {
            /* reloadProducts sets its own error state */
          }
          setActionMessage('Product updated successfully.');
        }}
      />
      <div className="wh-inventory-main">
        <section className="wh-hero wh-inventory-hero">
          <div className="wh-hero__inner">
            <p className="wh-inventory-hero__eyebrow">Inventory</p>
            <h2>Track stock across every product</h2>
            <p>
              Browse all products, availability, low stock alerts, and shipments in transit. Search
              by IME to trace a unit — including sold devices and where they were sold.
            </p>
            {!loading ? (
              <p className="wh-inventory-hero__platform-total">
                <strong>{platformTotalUnits.toLocaleString()}</strong> units in stock platform-wide
                {' · '}
                {platformProductLines.toLocaleString()} product line{platformProductLines === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        </section>

        <div className="wh-inventory-alert-badges">
        <InventoryMissingPhotosPanel
          pricingCatalog={pricingCatalog}
          loading={pricingCatalogLoading}
          open={missingPhotosOpen}
          onToggleOpen={() => setMissingPhotosOpen((open) => !open)}
          onGoToDirectSalePricing={onGoToDirectSalePricing}
        />

        <InventoryMissingPricingPanel
          products={products}
          loading={loading}
          open={missingPricingOpen}
          onToggleOpen={() => setMissingPricingOpen((open) => !open)}
        />
        </div>

        <InventoryImeLookup
          onSearch={(ime) => lookupInventoryByIme(axiosPrivate, ime)}
        />

        {!missingPhotosOpen && !missingPricingOpen ? (
          <>
        <div className="wh-status-row wh-inventory-tabs" role="tablist" aria-label="Inventory categories">
          {inventoryCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={categoryTab === cat.id}
              className={`wh-status-card wh-inventory-tab ${categoryTab === cat.id ? 'is-active' : ''}`}
              onClick={() => setCategoryTab(cat.id)}
            >
              <span className={`wh-status-card__icon ${cat.iconClass}`} aria-hidden>
                {cat.icon}
              </span>
              <div className="wh-status-card__body">
                <span className="wh-status-card__label">{cat.label}</span>
                <span className="wh-status-card__value">
                  {loading && cat.id !== 'sold-out'
                    ? '—'
                    : cat.id === 'sold-out'
                      ? soldOutTotal == null
                        ? '—'
                        : soldOutTotal.toLocaleString()
                      : cat.id === 'total-products'
                        ? totalProductRowCount.toLocaleString()
                        : (categoryUnitTotals[cat.id] ?? 0).toLocaleString()}
                </span>
                <span className="wh-status-card__sub">{cat.sub}</span>
              </div>
            </button>
          ))}
        </div>

        {loading ? (
          <section className="wh-panel">
            <div aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <span
                  key={n}
                  className="wh-skeleton"
                  style={{ display: 'block', height: 36, marginBottom: 8 }}
                />
              ))}
            </div>
            <p className="wh-empty" style={{ marginTop: '0.75rem' }}>
              Loading inventory products…
            </p>
          </section>
        ) : null}

        {!loading && error ? (
          <div className="wh-panel wh-inventory-alert wh-inventory-alert--error" role="alert">
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <section className="wh-panel">
            {categoryTab === 'sold-out' ? (
              <InventorySoldOutPanel
                axiosPrivate={axiosPrivate}
                onTotalChange={setSoldOutTotal}
                onRevoked={async () => {
                  await Promise.all([reloadProducts(), reloadOrders()]);
                }}
              />
            ) : (
              <>
            <div className="wh-section-head">
              <h3>
                {inventoryCategories.find((c) => c.id === categoryTab)?.label || 'Products'}
              </h3>
              <span className="wh-location-row__count">
                {modelSortedVisible.length} product{modelSortedVisible.length === 1 ? '' : 's'}
              </span>
            </div>

            <InventoryFilters
              rows={visibleWithIme}
              nameQuery={inventoryNameFilter}
              capacity={inventoryCapacityFilter}
              onNameQueryChange={handleInventoryNameFilterChange}
              onCapacityChange={handleInventoryCapacityFilterChange}
              idPrefix="admin-inv"
            />

            {actionMessage ? (
              <div
                className="wh-inventory-alert wh-inventory-alert--ok"
                role="status"
                style={{ marginBottom: '0.85rem' }}
              >
                {actionMessage}
              </div>
            ) : null}

            {categoryTab === 'travelling' ? (
              <div className="wh-inventory-bulk">
                <h4>Bulk batches in transit</h4>
                <p className="wh-inventory-bulk__lead">
                  Each bulk upload gets a unique batch ID. Mark a batch received when stock lands at
                  the main Warehouse; use &ldquo;Deliver to Shop&rdquo; when a Shop is assigned.
                </p>
                {bulkShipmentsLoading ? <p className="wh-empty">Loading bulk batches…</p> : null}
                {!bulkShipmentsLoading && bulkShipments.length === 0 ? (
                  <p className="wh-inventory-bulk__empty">No travelling bulk batches.</p>
                ) : null}
                {!bulkShipmentsLoading && bulkShipments.length > 0 ? (
                  <ul className="wh-inventory-bulk-list">
                    {bulkShipments.map((shipment) => {
                      const batchCode = shipment?.batchCode || '—';
                      const batchKey = String(shipment?.batchCode || shipment?._id || shipment?.id || '');
                      const hasDest = Boolean(
                        shipment?.destinationSubWarehouse &&
                          (typeof shipment.destinationSubWarehouse === 'object'
                            ? shipment.destinationSubWarehouse._id || shipment.destinationSubWarehouse.name
                            : shipment.destinationSubWarehouse),
                      );
                      const batchRoute = bulkBatchTravelRoute(shipment);
                      const destName = batchRoute.to;
                      const count = Number(shipment?.productCount) || 0;
                      return (
                        <li key={batchKey} className="wh-inventory-bulk-card">
                          <div>
                            <strong className="wh-inventory-bulk-card__code">{batchCode}</strong>
                            <span className="wh-inventory-bulk-card__meta">
                              {count} product{count === 1 ? '' : 's'}
                            </span>
                            <span
                              className="product-travel-route product-travel-route--block product-travel-route--compact"
                              title={`From ${batchRoute.from} to ${batchRoute.to}`}
                            >
                              <span className="product-travel-route__from">{batchRoute.from}</span>
                              <span className="product-travel-route__arrow" aria-hidden>
                                →
                              </span>
                              <span className="product-travel-route__to">{batchRoute.to}</span>
                            </span>
                          </div>
                          <button
                            type="button"
                            className="wh-inventory-btn wh-inventory-btn--success"
                            disabled={arrivingBatchId === batchKey}
                            onClick={() => handleMarkBatchDelivered(shipment)}
                          >
                            {arrivingBatchId === batchKey
                              ? 'Updating…'
                              : hasDest
                                ? 'Deliver to Shop'
                                : 'Mark batch received'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {modelSortedVisible.length === 0 ? (
              <p className="wh-empty">No products found for this category.</p>
            ) : (
              <div className="wh-inventory-table-wrap inventory-table-viewport">
                <table className="wh-activity-table wh-inventory-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Type</th>
                    {categoryTab === 'travelling' ? <th>Batch ID</th> : null}
                    <th>{categoryTab === 'travelling' ? 'Route' : 'Location'}</th>
                    <th>Shipment</th>
                    <th>Capacity</th>
                    {!hideStockColorColumns ? <th>Color</th> : null}
                    {!hideStockColorColumns ? <th>Stock</th> : null}
                    <th>Battery</th>
                    <th>IMEs</th>
                    <th className="fit-numeric-cell">Retail price</th>
                    <th className="fit-numeric-cell">Vendor price</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modelSortedVisible.map((row) => {
                    const rowKey = inventoryRowKey(row);
                    const { entry: activeLoc, product: p } = pickInventoryLocation(row, '');
                    const locations = Array.isArray(row?.locations) ? row.locations : [];
                    const id = String(p?._id ?? p?.id ?? activeLoc?.productId ?? '');
                    const shipment = activeLoc?.shipment || productShipmentStatus(p);
                    const batchCode = p?.bulkBatchCode ? String(p.bulkBatchCode) : '—';
                    const isBulk = Boolean(p?.bulkBatchCode || p?.bulkShipment);
                    const travelRoute = productTravelRoute(p);
                    const destName = travelRoute?.to || '';
                    const totalStock = inventoryRowUnitCount(row);
                    const multiLocation = locations.length > 1;
                    const multiProductLines = inventoryMergedRowHasMultipleProductDocs(row);
                    const imeCodes = inventoryRowImeCodes(row);
                    const { retail, wholesale } = resolveInventoryPricing(row, pricingLookup);
                    const isRowExpanded = expandedStorageSelection.rowKey === rowKey;
                    const expandedVariantForRow = isRowExpanded
                      ? pickInventoryCapacityVariant(row, expandedStorageSelection.capacity).row
                      : null;
                    let unitRows = [];
                    if (isRowExpanded && expandedVariantForRow) {
                      const lineRows = inventoryProductLineDetailRows(expandedVariantForRow);
                      if (lineRows.length > 1) {
                        unitRows = lineRows.map((line) => ({
                          ...line,
                          ime: normalizedImeList(line.product)[0] || '',
                        }));
                      } else {
                        const allUnits = inventoryUnitDetailRows(expandedVariantForRow);
                        unitRows = allUnits.filter(
                          (unit) =>
                            Boolean(String(unit?.ime || '').trim()) || allUnits.length === 1,
                        );
                      }
                    }

                    return (
                      <Fragment key={rowKey}>
                      <tr className={isRowExpanded ? 'wh-inventory-row--expanded' : ''}>
                        <td>
                          <InventoryProductNameCell
                            row={row}
                            productName={upperText(row?.product_name)}
                            hint={
                              multiLocation
                                ? `${locations.length} areas · ${totalStock} units`
                                : null
                            }
                            inlineStoragePickerKey={inlineStoragePickerKey}
                            expandedStorageSelection={expandedStorageSelection}
                            onProductSelect={handleInventoryProductSelect}
                            onStorageSelect={handleInventoryStorageSelect}
                          />
                        </td>
                        <td>
                          <span className="wh-tag wh-tag--pending">{upperText(row?.product_type)}</span>
                        </td>
                        {categoryTab === 'travelling' ? (
                          <td>
                            <code className="wh-inventory-batch-code">{batchCode}</code>
                          </td>
                        ) : null}
                        <td>
                          {multiLocation ? (
                            <span className="wh-inventory-multi-loc">{locations.length} areas</span>
                          ) : (
                            activeLoc?.label || productLocationDisplay(p)
                          )}
                        </td>
                        <td>
                          {multiLocation ? (
                            <span className="wh-tag wh-tag--pending">Multiple areas</span>
                          ) : (
                            <>
                              <span
                                className={`wh-tag ${
                                  shipment === 'travelling'
                                    ? 'wh-tag--travel'
                                    : shipment === 'arrived'
                                      ? 'wh-tag--arrived'
                                      : ''
                                }`}
                              >
                                {shipment}
                              </span>
                              {shipment === 'travelling' ? (
                                <ProductTravelRoute
                                  product={p}
                                  className="product-travel-route--block product-travel-route--compact"
                                />
                              ) : null}
                            </>
                          )}
                        </td>
                        <td>{formatInventoryCapacities(row)}</td>
                        {!hideStockColorColumns ? (
                          <td className="wh-inventory-cell--color">
                            <InventoryColorCell colors={inventoryColorOptions(row)} />
                          </td>
                        ) : null}
                        {!hideStockColorColumns ? (
                          <td>
                            <strong>{totalStock}</strong>
                          </td>
                        ) : null}
                        <td>{formatInventoryBatteryHealth(row) || ''}</td>
                        <td>
                          <InventoryImeCell codes={imeCodes} />
                        </td>
                        <td className="fit-numeric-cell">
                          {pricingCatalogLoading
                            ? '…'
                            : retail != null
                              ? <MoneyXaf value={retail} />
                              : '—'}
                        </td>
                        <td className="fit-numeric-cell">
                          {pricingCatalogLoading
                            ? '…'
                            : wholesale != null
                              ? <MoneyXaf value={wholesale} />
                              : '—'}
                        </td>
                        <td>
                          <div className="wh-inventory-table__actions">
                            {!multiLocation && !multiProductLines ? (
                              <>
                                {shipment === 'travelling' && !isBulk ? (
                                  <button
                                    type="button"
                                    className="wh-inventory-btn wh-inventory-btn--success"
                                    disabled={arrivingId === id}
                                    title={destName ? `Mark arrived at ${destName}` : 'Mark as arrived'}
                                    onClick={() => handleMarkArrived(id)}
                                  >
                                    {arrivingId === id ? 'Updating…' : 'Mark arrived'}
                                  </button>
                                ) : null}
                                {shipment === 'travelling' && isBulk ? (
                                  <span className="wh-inventory-batch-hint" title="Use batch actions above">
                                    Batch item
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  className="wh-inventory-btn wh-inventory-btn--primary"
                                  onClick={() => setEditProduct(p)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="wh-inventory-btn wh-inventory-btn--danger"
                                  onClick={() => openDeleteConfirm(id)}
                                  disabled={deletingId === id}
                                >
                                  {deletingId === id ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            ) : multiProductLines ? (
                              <span className="wh-inventory-batch-hint" title="Choose a storage size to delete one item at a time">
                                Expand storage to delete
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isRowExpanded
                        ? unitRows.map((unit, unitIndex) => {
                            const unitProduct = unit?.product || expandedVariantForRow || p;
                            const unitId = String(unit?.productId || unitProduct?._id || '');
                            const unitPricing = resolveInventoryPricing(unitProduct, pricingLookup);
                            return (
                              <tr
                                key={`${rowKey}-${unit.rowKey || unitId || unitIndex}`}
                                className="wh-inventory-unit-row"
                              >
                                <td className="wh-inventory-unit-row__product">
                                  <span className="wh-inventory-unit-row__marker" aria-hidden>
                                    ↳
                                  </span>
                                  Unit {unitIndex + 1}
                                </td>
                                <td>
                                  <span className="wh-tag wh-tag--pending">
                                    {upperText(unitProduct?.product_type || row?.product_type)}
                                  </span>
                                </td>
                                {categoryTab === 'travelling' ? (
                                  <td>
                                    <code className="wh-inventory-batch-code">
                                      {unit.bulkBatchCode || batchCode}
                                    </code>
                                  </td>
                                ) : null}
                                <td>{unit.area || activeLoc?.label || productLocationDisplay(unitProduct)}</td>
                                <td>
                                  <span
                                    className={`wh-tag ${
                                      unit.shipment === 'travelling'
                                        ? 'wh-tag--travel'
                                        : unit.shipment === 'arrived'
                                          ? 'wh-tag--arrived'
                                          : ''
                                    }`}
                                  >
                                    {unit.shipment || shipment}
                                  </span>
                                </td>
                                <td>{unit.capacity || expandedStorageSelection.capacity || '—'}</td>
                                {!hideStockColorColumns ? <td /> : null}
                                {!hideStockColorColumns ? <td /> : null}
                                <td>{formatBatteryHealthLabel(unitProduct?.batteryHealth) || ''}</td>
                                <td>
                                  {unit.ime ? (
                                    <code className="wh-inventory-ime-chip">{unit.ime}</code>
                                  ) : (
                                    <span className="wh-inventory-ime-cell--empty">No IME</span>
                                  )}
                                </td>
                                <td className="fit-numeric-cell">
                                  {unitPricing.retail != null ? <MoneyXaf value={unitPricing.retail} /> : '—'}
                                </td>
                                <td className="fit-numeric-cell">
                                  {unitPricing.wholesale != null ? <MoneyXaf value={unitPricing.wholesale} /> : '—'}
                                </td>
                                <td>
                                  <div className="wh-inventory-table__actions">
                                    {unit.shipment === 'travelling' && !unit.isBulk ? (
                                      <button
                                        type="button"
                                        className="wh-inventory-btn wh-inventory-btn--success"
                                        disabled={arrivingId === unitId}
                                        onClick={() => handleMarkArrived(unitId)}
                                      >
                                        {arrivingId === unitId ? 'Updating…' : 'Mark arrived'}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="wh-inventory-btn wh-inventory-btn--primary"
                                      onClick={() => setEditProduct(unitProduct)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="wh-inventory-btn wh-inventory-btn--danger"
                                      onClick={() => openDeleteConfirm(unitId, row?.product_name)}
                                      disabled={deletingId === unitId}
                                    >
                                      {deletingId === unitId ? 'Deleting…' : 'Delete'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
              </>
            )}
          </section>
        ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsPanel({
  orders = [],
  ordersLoading,
  ordersError,
  products = [],
  productsLoading,
  productsError,
  wholesalerStats = { total: 0, active: 0, pending: 0 },
  salesTeamCount = 0,
}) {
  const reportingOrders = useMemo(
    () => (Array.isArray(orders) ? orders : []).filter((o) => orderVisibleInShopList(o)),
    [orders],
  );

  const monthSeries = useMemo(() => {
    const map = new Map();
    reportingOrders.forEach((o) => {
      const key = orderMonthKey(o);
      if (!key) return;
      const row = map.get(key) || { key, label: formatMonthLabel(key), gross: 0, accepted: 0, rejected: 0, count: 0 };
      const amount = orderAmount(o);
      const status = normalizeOrderStatus(o?.status);
      row.count += 1;
      row.gross += amount;
      if (status === 'accepted') row.accepted += amount;
      if (status === 'rejected') row.rejected += amount;
      map.set(key, row);
    });
    return [...map.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-6);
  }, [reportingOrders]);

  const orderKpis = useMemo(() => {
    const statusCount = { received: 0, accepted: 0, rejected: 0 };
    let gross = 0;
    let acceptedRevenue = 0;
    let rejectedRevenue = 0;
    const productPerf = new Map();

    reportingOrders.forEach((o) => {
      const amount = orderAmount(o);
      const status = normalizeOrderStatus(o?.status);
      const qty = Math.max(1, Number(o?.quantity) || 1);
      const product = orderProductName(o);
      gross += amount;
      statusCount[status] = (statusCount[status] || 0) + 1;
      if (status === 'accepted') acceptedRevenue += amount;
      if (status === 'rejected') rejectedRevenue += amount;
      const prev = productPerf.get(product) || { qty: 0, amount: 0, orders: 0 };
      productPerf.set(product, { qty: prev.qty + qty, amount: prev.amount + amount, orders: prev.orders + 1 });
    });

    const totalOrders = reportingOrders.length;
    const net = acceptedRevenue - rejectedRevenue;
    const avgOrder = totalOrders > 0 ? gross / totalOrders : 0;
    const fulfillmentRate = totalOrders > 0 ? (statusCount.accepted / totalOrders) * 100 : 0;
    const rejectedRate = totalOrders > 0 ? (statusCount.rejected / totalOrders) * 100 : 0;

    const topProducts = [...productPerf.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);

    return {
      totalOrders,
      gross,
      acceptedRevenue,
      rejectedRevenue,
      net,
      avgOrder,
      fulfillmentRate,
      rejectedRate,
      statusCount,
      topProducts,
    };
  }, [reportingOrders]);

  const stockHealth = useMemo(() => {
    const total = products.length;
    const out = products.filter((p) => resolveEffectiveLineStock(p) <= 0).length;
    const low = products.filter((p) => {
      const units = resolveEffectiveLineStock(p);
      return units > 0 && units < 10;
    }).length;
    const healthy = Math.max(0, total - out - low);
    return { total, out, low, healthy };
  }, [products]);

  const loading = ordersLoading || productsLoading;
  const hasError = ordersError || productsError;
  const maxMonthlyAccepted = Math.max(1, ...monthSeries.map((m) => m.accepted || 0));
  const statusMax = Math.max(1, orderKpis.statusCount.received, orderKpis.statusCount.accepted, orderKpis.statusCount.rejected);

  return (
    <div className="dash-content">
      {loading ? (
        <section className="dash-panel">
          <p>Loading analytics from backend data...</p>
        </section>
      ) : null}
      {!loading && hasError ? (
        <section className="dash-panel">
          <p style={{ color: '#b91c1c' }}>{ordersError || productsError}</p>
        </section>
      ) : null}

      {!loading && !hasError ? (
        <>
          <section className="dash-kpis">
            <article className="dash-kpi-card"><span>Total orders</span><strong>{orderKpis.totalOrders}</strong></article>
            <article className="dash-kpi-card"><span>Gross value</span><strong><MoneyXaf value={orderKpis.gross} /></strong></article>
            <article className="dash-kpi-card"><span>Accepted revenue</span><strong><MoneyXaf value={orderKpis.acceptedRevenue} /></strong></article>
            <article className="dash-kpi-card"><span>Net revenue</span><strong><MoneyXaf value={orderKpis.net} /></strong></article>
            <article className="dash-kpi-card"><span>Avg order value</span><strong><MoneyXaf value={orderKpis.avgOrder} /></strong></article>
          </section>

          <section className="dash-grid-2">
            <article className="dash-panel">
              <h3>Order Status Mix</h3>
              <div className="analytics-stack">
                {[
                  { key: 'received', label: 'Received', value: orderKpis.statusCount.received, pct: orderKpis.totalOrders ? (orderKpis.statusCount.received / orderKpis.totalOrders) * 100 : 0 },
                  { key: 'accepted', label: 'Accepted', value: orderKpis.statusCount.accepted, pct: orderKpis.fulfillmentRate },
                  { key: 'rejected', label: 'Rejected', value: orderKpis.statusCount.rejected, pct: orderKpis.rejectedRate },
                ].map((s) => (
                  <div key={s.key} className="analytics-stack__row">
                    <div className="analytics-stack__head">
                      <span>{s.label}</span>
                      <strong>{s.value} ({formatPct(s.pct)})</strong>
                    </div>
                    <div className="analytics-stack__track">
                      <div className={`analytics-stack__fill analytics-stack__fill--${s.key}`} style={{ width: `${(s.value / statusMax) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="dash-panel">
              <h3>Account & Stock Health</h3>
              <ul className="country-list">
                <li><span>Vendors (total)</span><strong>{wholesalerStats.total}</strong></li>
                <li><span>Vendors active</span><strong>{wholesalerStats.active}</strong></li>
                <li><span>Vendors pending</span><strong>{wholesalerStats.pending}</strong></li>
                <li><span>Sales team size</span><strong>{salesTeamCount}</strong></li>
                <li><span>Products healthy stock</span><strong>{stockHealth.healthy}</strong></li>
                <li><span>Products low stock (&lt;10)</span><strong>{stockHealth.low}</strong></li>
                <li><span>Products out of stock</span><strong>{stockHealth.out}</strong></li>
              </ul>
            </article>
          </section>

          <section className="dash-panel">
            <h3>Accepted Revenue Trend (Last 6 Months)</h3>
            <div className="analytics-bars">
              {monthSeries.length === 0 ? (
                <p>No monthly order data yet.</p>
              ) : (
                monthSeries.map((m) => (
                  <div key={m.key} className="analytics-bars__item">
                    <div className="analytics-bars__value">
                      <MoneyXaf value={m.accepted} />
                    </div>
                    <div className="analytics-bars__track">
                      <div className="analytics-bars__fill" style={{ height: `${Math.max(8, (m.accepted / maxMonthlyAccepted) * 100)}%` }} />
                    </div>
                    <span className="analytics-bars__label">{m.label.split(' ')[0]}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="dash-panel">
            <h3>Top Products by Revenue</h3>
            <div className="table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Orders</th>
                    <th>Qty</th>
                    <th className="fit-numeric-cell">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {orderKpis.topProducts.length === 0 ? (
                    <tr>
                      <td colSpan={4}>No product performance data yet.</td>
                    </tr>
                  ) : (
                    orderKpis.topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td>{p.orders}</td>
                        <td>{p.qty}</td>
                        <td className="fit-numeric-cell">
                          <MoneyXaf value={p.amount} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function AdminDashboard({ onLogout }) {
  const { auth, isLoggingOut } = useAuth();
  const axiosPrivate = useAxiosPrivate();
  const { label: adminAccountLabel } = useAdminAccountRegion();
  const [tab, setTab] = useDashboardTab(ADMIN_TAB_IDS);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorage('wache-admin-sidebar-collapsed', false);
  const [pendingCount, setPendingCount] = useState(0);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [pendingOfferOrdersCount, setPendingOfferOrdersCount] = useState(0);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [wholesalerStats, setWholesalerStats] = useState({ total: 0, active: 0, pending: 0 });
  const [salesTeamCount, setSalesTeamCount] = useState(0);

  const reloadProducts = useCallback(async () => {
    if (!auth?.accessToken) return;
    setProductsLoading(true);
    setProductsError('');
    try {
      const data = await fetchAdminInventoryProducts(axiosPrivate);
      const rows = Array.isArray(data) ? data : [];
      setProducts(rows.map(normalizeProductRecord));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to fetch products from server.';
      const detail = err?.response?.data?.error;
      setProductsError(detail && String(detail) !== String(msg) ? `${msg} — ${detail}` : msg);
    } finally {
      setProductsLoading(false);
    }
  }, [auth?.accessToken, axiosPrivate]);

  useEffect(() => {
    if (!auth?.accessToken) {
      setProductsLoading(false);
      return;
    }
    reloadProducts().catch(() => {});
  }, [auth?.accessToken, reloadProducts]);

  useEffect(() => {
    if (!auth?.accessToken) return undefined;
    return subscribeProductCatalogUpdated(() => {
      reloadProducts().catch(() => {});
    });
  }, [auth?.accessToken, reloadProducts]);

  const reloadPendingOfferOrdersCount = useCallback(async () => {
    if (!auth?.accessToken) return;
    try {
      const offers = await fetchPendingOfferOrders(axiosPrivate);
      setPendingOfferOrdersCount(offers.length);
    } catch {
      setPendingOfferOrdersCount(0);
    }
  }, [auth?.accessToken, axiosPrivate]);

  const reloadOrders = useCallback(async () => {
    if (!auth?.accessToken) return;
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const data = await fetchOrdersList(axiosPrivate, { limit: 250, page: 1 });
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      const m = e?.response?.data?.message || e?.message || 'Failed to load orders.';
      const d = e?.response?.data?.error;
      setOrdersError(d && String(d).trim() && String(d) !== String(m) ? `${m} — ${d}` : m);
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [auth?.accessToken, axiosPrivate]);

  useEffect(() => {
    if (!auth?.accessToken) return;
    reloadPendingOfferOrdersCount().catch(() => {});
  }, [auth?.accessToken, reloadPendingOfferOrdersCount]);

  useEffect(() => {
    if (String(auth?.role || '').toLowerCase() !== 'admin') return undefined;
    return subscribeOrderCreated((orderType) => {
      if (orderType === 'offer') reloadPendingOfferOrdersCount().catch(() => {});
      if (orderType === 'preorder') reloadOrders().catch(() => {});
    });
  }, [auth?.role, reloadPendingOfferOrdersCount, reloadOrders]);

  useEffect(() => {
    if (!auth?.accessToken || String(auth?.role || '').toLowerCase() !== 'admin') return undefined;
    const STAFF_BADGE_POLL_MS = 45000;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      reloadPendingOfferOrdersCount().catch(() => {});
    };
    const intervalId = window.setInterval(tick, STAFF_BADGE_POLL_MS);
    return () => window.clearInterval(intervalId);
  }, [auth?.accessToken, auth?.role, reloadPendingOfferOrdersCount]);

  const handleDeleteProduct = async (productId) => {
    await deleteProductById(axiosPrivate, productId);
    setProducts((prev) => (prev || []).filter((p) => String(p?._id ?? p?.id ?? '') !== String(productId)));
    notifyProductCatalogUpdated();
  };

  useEffect(() => {
    if (!auth?.accessToken) return;
    let alive = true;
    const loadUserAnalytics = async () => {
      try {
        const [wholesalers, salesTeam] = await Promise.all([
          fetchWholesalers(axiosPrivate),
          fetchStaffList(axiosPrivate),
        ]);
        if (!alive) return;
        const total = wholesalers.length;
        const active = wholesalers.filter((u) => String(u?.accountStatus || '').toLowerCase() === 'active').length;
        const pending = wholesalers.filter((u) => String(u?.accountStatus || '').toLowerCase() === 'pending').length;
        setWholesalerStats({ total, active, pending });
        setSalesTeamCount(Array.isArray(salesTeam) ? salesTeam.length : 0);
      } catch {
        if (!alive) return;
        setWholesalerStats({ total: 0, active: 0, pending: 0 });
        setSalesTeamCount(0);
      }
    };
    loadUserAnalytics();
    return () => {
      alive = false;
    };
  }, [auth?.accessToken, axiosPrivate]);

  useEffect(() => {
    if (!auth?.accessToken) return;
    reloadOrders();
  }, [auth?.accessToken, reloadOrders]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 920) setMobileNavOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '▣' },
    { id: 'warehouses', label: 'Warehouses', icon: '🏭' },
    { id: 'shops', label: 'Shops', icon: '🏪' },
    { id: 'orders', label: 'Orders', icon: '📋' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'direct-sale', label: 'Direct sale', icon: '💳' },
    { id: 'sales', label: 'Staff', icon: '👥' },
    {
      id: 'accounts',
      label: `Accounts${pendingCount > 0 ? ` • ${pendingCount}` : ''}`,
      icon: '👤',
      badge: pendingCount > 0 ? pendingCount : null,
    },
    { id: 'business-cities', label: 'Settings', icon: '⚙️' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
  ];

  const showCollapsedSidebar = sidebarCollapsed && !mobileNavOpen;

  return (
    <div className={`admin-layout ${showCollapsedSidebar ? 'is-sidebar-collapsed' : ''}`}>
      {mobileNavOpen && (
        <button
          type="button"
          className="admin-sidebar-backdrop"
          aria-label="Close menu"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`admin-sidebar ${mobileNavOpen ? 'is-open' : ''} ${
          showCollapsedSidebar ? 'admin-sidebar--collapsed' : ''
        }`}
      >
        <div className="admin-brand">
          <BrandLogo alt="Wache" width={showCollapsedSidebar ? 36 : 48} height={showCollapsedSidebar ? 36 : 48} />
          <button
            type="button"
            className="admin-sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand menu' : 'Collapse menu'}
            onClick={() => setSidebarCollapsed((v) => !v)}
          >
            <span className="admin-sidebar-toggle__chevron" aria-hidden />
          </button>
        </div>
        <div className="admin-sidebar__middle">
          <nav className="admin-nav">
            {navItems.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`admin-nav-btn ${tab === n.id ? 'active' : ''}`}
                title={n.label}
                aria-label={n.label}
                onClick={() => {
                  setTab(n.id);
                  setMobileNavOpen(false);
                }}
              >
                <span className="admin-nav-btn__icon" aria-hidden>
                  {n.icon}
                </span>
                <span className="admin-nav-btn__label">{n.label}</span>
                {n.badge ? (
                  <span className="admin-nav-btn__badge" aria-hidden>
                    {n.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>
        </div>
        <footer className="admin-sidebar__footer">
          <button
            type="button"
            className="admin-nav-btn logout"
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            title="Sign Out"
            aria-label="Sign Out"
            onClick={() => {
              setMobileNavOpen(false);
              onLogout?.();
            }}
          >
            <span className="admin-nav-btn__icon" aria-hidden>
              ⎋
            </span>
            <span className="admin-nav-btn__label">
              {isLoggingOut ? (
                <>
                  <span className="admin-signout-spinner" aria-hidden />
                  Signing out…
                </>
              ) : (
                'Sign Out'
              )}
            </span>
          </button>
        </footer>
      </aside>

      <main
        className="admin-main"
        onClick={() => {
          if (mobileNavOpen) setMobileNavOpen(false);
        }}
      >
        <header className="admin-topbar">
          <div className="admin-topbar__title-wrap">
            <button
              type="button"
              className="admin-mobile-menu-btn"
              aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileNavOpen}
              onClick={(e) => {
                e.stopPropagation();
                setMobileNavOpen((v) => !v);
              }}
            >
              <span />
              <span />
              <span />
            </button>
            <div className="admin-topbar__heading">
              <h1>
                {tab === 'dashboard'
                  ? 'Dashboard'
                  : tab === 'warehouses'
                    ? 'Warehouses'
                    : tab === 'shops'
                      ? 'Shops'
                      : tab === 'warehouses-setup'
                        ? 'Warehouse setup'
                        : tab === 'shops-setup'
                          ? 'Shop setup'
                          : tab === 'direct-sale'
                            ? 'Direct sale'
                            : tab === 'reports'
                              ? 'Reports'
                              : tab === 'expenses'
                                ? 'Expenses'
                              : tab === 'business-cities'
                                ? 'Settings'
                              : tab === 'add'
                              ? 'Add inventory'
                              : tab[0].toUpperCase() + tab.slice(1)}
              </h1>
              <p>Overview of your Shop · {adminAccountLabel}</p>
            </div>
          </div>
          <div className="admin-top-links">
            <Link
              to="/notifications"
              className="admin-top-notif-link"
              aria-label={
                pendingOfferOrdersCount > 0
                  ? `Notifications, ${pendingOfferOrdersCount} pending offer orders`
                  : 'Notifications'
              }
            >
              <span className="admin-top-notif-link__label admin-top-notif-link__label--desktop">
                Notifications
              </span>
              <span className="admin-top-notif-link__label admin-top-notif-link__label--mobile">
                Alerts
              </span>
              {pendingOfferOrdersCount > 0 && (
                <span className="admin-notif-badge" title="Pending offer orders">
                  {pendingOfferOrdersCount > 99 ? '99+' : pendingOfferOrdersCount}
                </span>
              )}
            </Link>
            <Link to="/" className="admin-view-store-link">
              <span className="admin-view-store-link__label admin-view-store-link__label--desktop">
                View vendor Shop →
              </span>
              <span className="admin-view-store-link__label admin-view-store-link__label--mobile">
                Shop →
              </span>
            </Link>
            <button
              type="button"
              className="admin-top-signout-btn"
              disabled={isLoggingOut}
              aria-busy={isLoggingOut}
              onClick={() => onLogout?.()}
            >
              {isLoggingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </header>

        <div className="admin-tab-panel" hidden={tab !== 'dashboard'}>
          <AdminOverviewDashboard />
        </div>
        <div className="admin-tab-panel" hidden={tab !== 'warehouses'}>
          <WarehouseGridDashboard
            variant="warehouse"
            cacheSessionKey={auth?.userId}
            userName={auth?.user}
            pendingOfferOrdersCount={pendingOfferOrdersCount}
            onAddLocation={() => setTab('warehouses-setup')}
            onAddBulk={() => setTab('add')}
          />
        </div>
        <div className="admin-tab-panel" hidden={tab !== 'shops'}>
          <WarehouseGridDashboard
            variant="shop"
            cacheSessionKey={auth?.userId}
            userName={auth?.user}
            pendingOfferOrdersCount={pendingOfferOrdersCount}
            onAddLocation={() => setTab('shops-setup')}
          />
        </div>
        {tab === 'orders' && (
          <OrdersPanel
            orders={orders}
            loading={ordersLoading}
            error={ordersError}
            currentUser={{ id: auth?.userId, name: auth?.user }}
            axiosPrivate={axiosPrivate}
            onOrdersReload={reloadOrders}
          />
        )}
        {tab === 'inventory' && (
          <InventoryPanel
            products={products}
            loading={productsLoading}
            error={productsError}
            onDeleteProduct={handleDeleteProduct}
            reloadProducts={reloadProducts}
            onGoToDirectSalePricing={() => setTab('direct-sale')}
          />
        )}
        {tab === 'warehouses-setup' && (
          <WarehousesPanel mode="warehouse" onBack={() => setTab('warehouses')} />
        )}
        {tab === 'shops-setup' && (
          <WarehousesPanel mode="shop" onBack={() => setTab('shops')} />
        )}
        {tab === 'direct-sale' && (
          <DirectSalePanel
            requireLocationAssignment
            onRecorded={async () => {
              await Promise.all([reloadProducts(), reloadOrders()]);
            }}
          />
        )}
        {tab === 'analytics' && (
          <AnalyticsPanel
            orders={orders}
            ordersLoading={ordersLoading}
            ordersError={ordersError}
            products={products}
            productsLoading={productsLoading}
            productsError={productsError}
            wholesalerStats={wholesalerStats}
            salesTeamCount={salesTeamCount}
          />
        )}
        {tab === 'reports' && <SalesReportsPanel />}
        {tab === 'accounts' && <AccountsPanel onPendingCountChange={setPendingCount} />}
        {tab === 'business-cities' && <SettingsPanel />}
        {tab === 'expenses' && <ExpensesPanel mode="admin" />}
        {tab === 'add' && (
          <AddInventoryPanel
            onProductSaved={async () => {
              await reloadProducts();
            }}
          />
        )}
        {tab === 'sales' && <CreateSalesmanForm />}
      </main>
    </div>
  );
}
