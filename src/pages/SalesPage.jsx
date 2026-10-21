import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useDashboardTab from '../hooks/useDashboardTab';
import { useNotificationInboxOptional } from '../context/NotificationInboxContext';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import { getAccessToken } from '../api/tokenStore';
import { getUserIdFromAccessToken } from '../utils/jwtUser';
import { fetchMyAssignedShops, fetchMyShopDetail, fetchMyShopProducts, fetchAllGeneralInventoryProducts, lookupInventoryByIme } from '../api/salesShopApi';
import { warehouseId } from '../api/warehouseApi';
import { subscribeOrderCreated } from '../utils/orderCreatedEvents';
import { filterOrdersForShop } from '../utils/shopOrderFilter';
import { orderMatchesShop, orderVisibleInShopList } from '../utils/orderDisplay';
import { productLineUnitCount } from '../utils/productIme';
import { isProductTravelling } from '../utils/productTravelRoute';
import BrandLogo from '../components/BrandLogo';
import DirectSalePanel from '../components/admin/DirectSalePanel';
import OrdersManagementPanel from '../components/shared/OrdersManagementPanel';
import SalesShopDashboard from '../components/sales/SalesShopDashboard';
import SalesShopInventory from '../components/sales/SalesShopInventory';
import SalesShopUnits from '../components/sales/SalesShopUnits';
import SalesShopIncoming from '../components/sales/SalesShopIncoming';
import SalesShopAccounts from '../components/sales/SalesShopAccounts';
import SalesShopExpenses from '../components/sales/SalesShopExpenses';
import SalesPortalEarnings from '../components/sales/SalesPortalEarnings';
import SalesTransactionReceipts from '../components/sales/SalesTransactionReceipts';
import InventoryImeLookup from '../components/admin/InventoryImeLookup';
import '../components/admin/InventoryPanel.css';
import '../components/admin/AdminOrdersPanel.css';
import '../components/admin/WarehouseDashboard.css';
import './SalesPage.css';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'units', label: 'Shop inventory', icon: 'units' },
  { id: 'sales', label: 'Sales', icon: 'sales' },
  { id: 'orders', label: 'Orders', icon: 'orders' },
  { id: 'account', label: 'Account', icon: 'account' },
  { id: 'portal', label: 'Portal', icon: 'portal' },
  { id: 'expenses', label: 'Expenses', icon: 'expenses' },
];

const TAB_HEADINGS = {
  dashboard: { title: 'Dashboard', subtitle: 'Overview for your selected shop.' },
  inventory: { title: 'Inventory', subtitle: 'All available products across every warehouse and shop.' },
  units: { title: 'Shop inventory', subtitle: 'Products with IME currently available at this shop.' },
  sales: { title: 'Sales', subtitle: 'Record direct sales or browse full inventory pricing.' },
  orders: { title: 'Orders', subtitle: 'Review and fulfill orders for this shop area.' },
  account: { title: 'Account', subtitle: 'Staff and vendor customers linked to this shop.' },
  portal: { title: 'Portal', subtitle: 'Your personal profile and settings.' },
  expenses: { title: 'Store expense', subtitle: 'Record and review expenses for this shop.' },
};

function normalizeOrdersBody(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function NavIcon({ name }) {
  const strokeProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.25,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" {...strokeProps} />
          <rect x="13" y="4" width="7" height="4" rx="1.5" {...strokeProps} />
          <rect x="13" y="10" width="7" height="10" rx="1.5" {...strokeProps} />
          <rect x="4" y="13" width="7" height="7" rx="1.5" {...strokeProps} />
        </svg>
      );
    case 'inventory':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 8h18v11H3z" {...strokeProps} />
          <path d="M7 4h10v4H7z" {...strokeProps} />
          <path d="M8 12h8M8 16h6" {...strokeProps} />
        </svg>
      );
    case 'units':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2" {...strokeProps} />
          <path d="M8 10h4M14 10h2M8 14h4M14 14h2" {...strokeProps} />
        </svg>
      );
    case 'sales':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 17l5-5 3 3 7-8 3 2-10 11-3-3-5 5z" {...strokeProps} />
        </svg>
      );
    case 'orders':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 4h12v4H6zM5 9h14v11H5z" {...strokeProps} />
          <path d="M8 13h10M8 17h7" {...strokeProps} />
        </svg>
      );
    case 'account':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="4" {...strokeProps} />
          <path d="M5 20c0-3.87 3.13-7 7-7s7 3.13 7 7" {...strokeProps} />
        </svg>
      );
    case 'portal':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" {...strokeProps} />
          <path d="M12 3v9l7 4" {...strokeProps} />
        </svg>
      );
    case 'expenses':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5h12v14H6z" {...strokeProps} />
          <path d="M9 9h8M9 13h8M9 17h5" {...strokeProps} />
        </svg>
      );
    default:
      return null;
  }
}

const SALES_TAB_IDS = NAV_ITEMS.map((item) => item.id);

const SALES_TAB_STORAGE_KEY = 'wache-sales-active-tab';

export default function SalesPage({ onLogout }) {
  const { auth, isLoggingOut } = useAuth();
  const inbox = useNotificationInboxOptional();
  const notifUnread = inbox?.unreadCount ?? 0;
  const axiosPrivate = useAxiosPrivate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useDashboardTab(SALES_TAB_IDS);

  useEffect(() => {
    try {
      const saved = String(sessionStorage.getItem(SALES_TAB_STORAGE_KEY) || '').trim();
      if (saved && SALES_TAB_IDS.includes(saved) && saved !== tab) {
        setTab(saved);
      }
    } catch {
      /* ignore storage errors */
    }
    // Restore last salesperson tab once on entry (e.g. after refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SALES_TAB_STORAGE_KEY, tab);
    } catch {
      /* ignore storage errors */
    }
  }, [tab]);

  const ensureSalesTab = useCallback(() => {
    if (tab !== 'sales') setTab('sales');
  }, [setTab, tab]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [shopDetail, setShopDetail] = useState(null);
  const [shopProducts, setShopProducts] = useState([]);
  const [systemInventoryProducts, setSystemInventoryProducts] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [systemInventoryLoading, setSystemInventoryLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState('');

  const currentUser = useMemo(
    () => ({
      id: String(auth?.userId || getUserIdFromAccessToken(getAccessToken()) || '').trim(),
      name: auth?.user || auth?.name || '',
    }),
    [auth],
  );

  const selectedShop = useMemo(
    () => shops.find((s) => warehouseId(s) === selectedShopId) || shopDetail?.shop || null,
    [shops, selectedShopId, shopDetail],
  );

  const shopOrders = useMemo(
    () => filterOrdersForShop(orders, selectedShop).filter((o) => orderVisibleInShopList(o)),
    [orders, selectedShop],
  );

  const updateSelectedShop = useCallback(
    (shopId) => {
      const id = String(shopId || '').trim();
      setSelectedShopId(id);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('shop', id);
          else next.delete('shop');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadShops = useCallback(async () => {
    setShopsLoading(true);
    setShopsError('');
    try {
      const rows = await fetchMyAssignedShops(axiosPrivate);
      setShops(rows);
      const urlShop = String(searchParams.get('shop') || '').trim();
      if (urlShop && rows.some((s) => warehouseId(s) === urlShop)) {
        setSelectedShopId(urlShop);
      } else if (rows.length === 1) {
        updateSelectedShop(warehouseId(rows[0]));
      } else if (rows.length && selectedShopId && !rows.some((s) => warehouseId(s) === selectedShopId)) {
        updateSelectedShop(warehouseId(rows[0]));
      }
    } catch (e) {
      setShopsError(e?.response?.data?.message || e?.message || 'Failed to load your shops.');
      setShops([]);
    } finally {
      setShopsLoading(false);
    }
  }, [axiosPrivate, searchParams, selectedShopId, updateSelectedShop]);

  const loadSystemInventory = useCallback(async () => {
    setSystemInventoryLoading(true);
    try {
      const data = await fetchAllGeneralInventoryProducts(axiosPrivate);
      setSystemInventoryProducts(Array.isArray(data?.products) ? data.products : []);
    } catch {
      setSystemInventoryProducts([]);
    } finally {
      setSystemInventoryLoading(false);
    }
  }, [axiosPrivate]);

  const loadShopDetail = useCallback(async () => {
    if (!selectedShopId) {
      setShopDetail(null);
      setShopProducts([]);
      return;
    }
    setDetailLoading(true);
    try {
      const [detail, stock] = await Promise.all([
        fetchMyShopDetail(axiosPrivate, selectedShopId),
        fetchMyShopProducts(axiosPrivate, selectedShopId),
      ]);
      setShopDetail(detail);
      setShopProducts(stock.products);
    } catch (e) {
      setShopDetail(null);
      setShopProducts([]);
      setShopsError(e?.response?.data?.message || e?.message || 'Failed to load shop details.');
    } finally {
      setDetailLoading(false);
    }
  }, [axiosPrivate, selectedShopId]);

  const loadOrders = useCallback(async () => {
    if (!auth?.accessToken) return;
    setOrdersLoading(true);
    setOrdersError('');
    try {
      const res = await axiosPrivate.get('/orders', { params: { limit: 250, page: 1 }, timeout: 20000 });
      setOrders(normalizeOrdersBody(res.data));
    } catch (e) {
      setOrdersError(e?.response?.data?.message || e?.message || 'Failed to load orders.');
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [auth?.accessToken, axiosPrivate]);

  useEffect(() => {
    loadShops().catch(() => {});
  }, [loadShops]);

  useEffect(() => {
    loadShopDetail().catch(() => {});
  }, [loadShopDetail]);

  useEffect(() => {
    if (tab === 'inventory' && selectedShopId) {
      loadSystemInventory().catch(() => {});
    }
  }, [tab, selectedShopId, loadSystemInventory]);

  useEffect(() => {
    loadOrders().catch(() => {});
  }, [loadOrders]);

  useEffect(() => {
    return subscribeOrderCreated(() => {
      loadOrders().catch(() => {});
    });
  }, [loadOrders]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setMobileNavOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const orderFilter = useCallback(
    (order) => orderMatchesShop(order, selectedShop),
    [selectedShop],
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    document.body.classList.add('sales-light-shell');
    return () => {
      document.body.classList.remove('sales-light-shell');
    };
  }, []);

  const heading = TAB_HEADINGS[tab] || TAB_HEADINGS.dashboard;
  const stats = useMemo(() => {
    const base = shopDetail?.stats || selectedShop || {};
    if (base.unitsAtShop != null && Number.isFinite(Number(base.unitsAtShop))) {
      return base;
    }
    const unitsAtShop = (shopProducts || [])
      .filter((p) => !isProductTravelling(p))
      .reduce((sum, p) => sum + productLineUnitCount(p), 0);
    return { ...base, unitsAtShop };
  }, [shopDetail?.stats, selectedShop, shopProducts]);

  return (
    <div className="sales-layout">
      {mobileNavOpen ? (
        <button type="button" className="sales-sidebar-backdrop" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />
      ) : null}

      <aside className={`sales-sidebar ${mobileNavOpen ? 'is-open' : ''}`}>
        <div className="sales-brand">
          <BrandLogo alt="Wache" />
        </div>

        {shops.length > 1 ? (
          <label className="sales-shop-picker">
            <span className="sales-shop-picker__label">Shop</span>
            <select
              value={selectedShopId}
              onChange={(e) => updateSelectedShop(e.target.value)}
            >
              <option value="">Select shop…</option>
              {shops.map((shop) => {
                const id = warehouseId(shop);
                return (
                  <option key={id} value={id}>
                    {shop.name} — {shop.city || 'Other'}
                  </option>
                );
              })}
            </select>
          </label>
        ) : selectedShop ? (
          <p className="sales-shop-picker__single">{selectedShop.name}</p>
        ) : null}

        <nav className="sales-nav" aria-label="Shop sections">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sales-nav-btn ${tab === item.id ? 'active' : ''}`}
              onClick={() => {
                setTab(item.id);
                setMobileNavOpen(false);
              }}
            >
              <span className={`sales-nav-btn__icon sales-nav-btn__icon--${item.icon}`} aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span className="sales-nav-btn__label">
                {item.label}
                {item.id === 'orders' && shopOrders.length > 0 ? ` (${shopOrders.length})` : ''}
              </span>
            </button>
          ))}
        </nav>

        <button type="button" className="sales-nav-btn logout" disabled={isLoggingOut} aria-busy={isLoggingOut} onClick={() => onLogout?.()}>
          {isLoggingOut ? (
            <>
              <span className="sales-signout-spinner" aria-hidden />
              Signing out…
            </>
          ) : (
            'Sign Out'
          )}
        </button>
      </aside>

      <main className="sales-main" onClick={() => mobileNavOpen && setMobileNavOpen(false)}>
        <header className="sales-topbar">
          <div className="sales-topbar__title-wrap">
            <button
              type="button"
              className="sales-mobile-menu-btn"
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
            <div className="sales-topbar__heading">
              <h1>{heading.title}</h1>
              <p>{heading.subtitle}</p>
            </div>
          </div>
          <div className="sales-top-links">
            {tab === 'orders' ? (
              <button type="button" className="sales-refresh-btn" onClick={() => loadOrders()}>
                Refresh
              </button>
            ) : null}
            <Link to="/notifications" className="sales-top-notif-link" aria-label="Notifications">
              Notifications
              {notifUnread > 0 ? <span className="sales-notif-badge">{notifUnread > 99 ? '99+' : notifUnread}</span> : null}
            </Link>
            <Link to="/" className="sales-view-store-link">
              View vendor Shop →
            </Link>
          </div>
        </header>

        <div className="sales-content">
          {shopsLoading ? <p className="sales-hint">Loading your shops…</p> : null}
          {shopsError ? <p className="sales-alert sales-alert--err">{shopsError}</p> : null}

          {!shopsLoading && shops.length === 0 ? (
            <div className="wh-panel sales-shop-empty">
              <strong>No shop assigned yet.</strong>
              <p>Ask an admin to assign you to a shop in the Staff section.</p>
            </div>
          ) : null}

          {!shopsLoading && shops.length > 0 && !selectedShopId ? (
            <div className="wh-panel sales-shop-empty">
              <strong>Select a shop</strong>
              <p>Choose a shop from the sidebar to view dashboard, inventory, and orders.</p>
            </div>
          ) : null}

          {selectedShopId && !shopsLoading ? (
            <>
              {tab === 'dashboard' ? (
                <SalesShopDashboard shop={selectedShop} stats={stats} orders={shopOrders} />
              ) : null}

              {tab === 'inventory' ? (
                <>
                  <InventoryImeLookup
                    onSearch={(ime) => lookupInventoryByIme(axiosPrivate, ime)}
                  />
                  <SalesShopIncoming
                    shop={selectedShop}
                    onAccepted={async () => {
                      await Promise.all([loadShopDetail(), loadSystemInventory()]);
                    }}
                  />
                  <SalesShopInventory
                    shop={selectedShop}
                    products={systemInventoryProducts}
                    loading={systemInventoryLoading}
                    scope="system"
                  />
                </>
              ) : null}

              {tab === 'units' ? (
                <SalesShopUnits shop={selectedShop} products={shopProducts} loading={detailLoading} />
              ) : null}

              {tab === 'sales' ? (
                <DirectSalePanel
                  contextShop={selectedShop}
                  contextShopProducts={shopProducts}
                  onEnsureSalesTab={ensureSalesTab}
                  onRecorded={async () => {
                    await Promise.all([loadOrders(), loadShopDetail()]);
                  }}
                />
              ) : null}

              {tab === 'orders' ? (
                <OrdersManagementPanel
                  orders={orders}
                  loading={ordersLoading}
                  error={ordersError}
                  currentUser={currentUser}
                  axiosPrivate={axiosPrivate}
                  onOrdersReload={loadOrders}
                  allowDelete={false}
                  filterOrder={orderFilter}
                  eyebrow="Shop orders"
                  title={`Orders — ${selectedShop?.name || 'Shop'}`}
                  subtitle="Same order tools as admin, scoped to this shop city."
                  pdfFilePrefix={`wache-shop-${selectedShopId}`}
                />
              ) : null}

              {tab === 'account' ? (
                <SalesShopAccounts
                  shop={selectedShop}
                  team={shopDetail?.teamAtShop || []}
                  orders={shopOrders}
                />
              ) : null}

              {tab === 'portal' ? (
                <div className="sales-shop-portal">
                  <SalesPortalEarnings
                    orders={orders}
                    shop={selectedShop}
                    staffUserId={currentUser.id}
                    staffName={currentUser.name}
                  />
                  <SalesTransactionReceipts
                    orders={orders}
                    shop={selectedShop}
                    staffUserId={currentUser.id}
                    staffName={currentUser.name}
                  />
                </div>
              ) : null}

              {tab === 'expenses' ? <SalesShopExpenses shop={selectedShop} /> : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
