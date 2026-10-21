import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { fetchAdminDashboardStats } from '../../api/adminApi';
import { formatMonthLabel, toMonthKey } from '../../utils/orderMonthUtils';
import MoneyXaf from '../MoneyXaf';
import { formatMoneyXaf, formatNumberWithCommas } from '../../utils/formatMoneyXaf';
import './AdminOverviewDashboard.css';

function formatMoneyShort(v) {
  const n = Number(v || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}

function formatCount(v) {
  return formatNumberWithCommas(v);
}

function greetingForHour(h) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const METRIC_ICONS = {
  products: '📦',
  units: '🏷️',
  value: '💰',
  monthly: '📈',
  retail: '🛒',
  wholesale: '🏬',
};

const SCOPE_ENTIRE = '';
const SCOPE_WAREHOUSE_PREFIX = 'wh:';
const SCOPE_SHOP_PREFIX = 'shop:';

function warehouseScopeId(warehouseId) {
  return `${SCOPE_WAREHOUSE_PREFIX}${warehouseId}`;
}

function shopScopeId(shopId) {
  return `${SCOPE_SHOP_PREFIX}${shopId}`;
}

function parseMetricsScope(scope) {
  if (!scope || scope === SCOPE_ENTIRE) {
    return { type: 'entire', id: '' };
  }
  if (scope.startsWith(SCOPE_WAREHOUSE_PREFIX)) {
    return { type: 'warehouse', id: scope.slice(SCOPE_WAREHOUSE_PREFIX.length) };
  }
  if (scope.startsWith(SCOPE_SHOP_PREFIX)) {
    return { type: 'shop', id: scope.slice(SCOPE_SHOP_PREFIX.length) };
  }
  return { type: 'unknown', id: scope };
}

export default function AdminOverviewDashboard() {
  const axiosPrivate = useAxiosPrivate();
  const { auth } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(() => toMonthKey(new Date()));
  const [stats, setStats] = useState(null);
  const [chartMonths, setChartMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [metricsScope, setMetricsScope] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [shopsOpen, setShopsOpen] = useState(true);

  const monthOptions = useMemo(() => {
    const now = new Date();
    const options = [];
    for (let i = 0; i < 12; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = toMonthKey(d);
      if (!value) continue;
      options.push({ value, label: formatMonthLabel(value) });
    }
    return options;
  }, []);

  const chartMonthKeys = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const keys = [];
    for (let i = 2; i >= 0; i -= 1) {
      const d = new Date(y, m - 1 - i, 1);
      const key = toMonthKey(d);
      if (key) keys.push(key);
    }
    return keys;
  }, [selectedMonth]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [current, ...trend] = await Promise.all([
        fetchAdminDashboardStats(axiosPrivate, { month: selectedMonth }),
        ...chartMonthKeys
          .filter((k) => k !== selectedMonth)
          .map((month) => fetchAdminDashboardStats(axiosPrivate, { month })),
      ]);

      const trendMap = new Map();
      chartMonthKeys.forEach((key) => {
        if (key === selectedMonth) trendMap.set(key, current);
      });
      let trendIdx = 0;
      chartMonthKeys.forEach((key) => {
        if (key !== selectedMonth) {
          trendMap.set(key, trend[trendIdx]);
          trendIdx += 1;
        }
      });

      setStats(current || null);
      setChartMonths(
        chartMonthKeys.map((key) => ({
          key,
          label: formatMonthLabel(key).split(' ')[0],
          data: trendMap.get(key) || null,
        })),
      );
    } catch (err) {
      setStats(null);
      setChartMonths([]);
      setError(err?.response?.data?.message || err?.message || 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, selectedMonth, chartMonthKeys]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const shopPerformance = useMemo(() => {
    const rows = Array.isArray(stats?.shopPerformance) ? stats.shopPerformance : [];
    return rows;
  }, [stats?.shopPerformance]);

  const allShops = useMemo(() => {
    const rows = Array.isArray(stats?.shops) ? stats.shops : [];
    return rows;
  }, [stats?.shops]);

  const allWarehouses = useMemo(() => {
    const rows = Array.isArray(stats?.warehouses) ? stats.warehouses : [];
    return rows;
  }, [stats?.warehouses]);

  const scopeInfo = useMemo(() => parseMetricsScope(metricsScope), [metricsScope]);

  const scopedMetrics = useMemo(() => {
    if (!stats) return null;
    if (scopeInfo.type === 'entire') {
      return {
        scopeLabel: 'Entire inventory',
        scopeKind: 'entire',
        totalProducts: stats.totalProducts,
        inventoryUnits: stats.inventoryUnits,
        inventoryValue: stats.inventoryValue,
        monthlySales: stats.monthlySales,
        retailSold: stats.retailSold,
        wholesaleSold: stats.wholesaleSold,
      };
    }
    if (scopeInfo.type === 'warehouse') {
      const warehouse = allWarehouses.find((w) => w.warehouseId === scopeInfo.id);
      if (!warehouse) return null;
      return {
        scopeLabel: warehouse.name,
        scopeKind: 'warehouse',
        totalProducts: warehouse.totalProducts,
        inventoryUnits: warehouse.inventoryUnits,
        inventoryValue: warehouse.inventoryValue,
        monthlySales: warehouse.monthlySales,
        retailSold: warehouse.retailSold,
        wholesaleSold: warehouse.wholesaleSold,
      };
    }
    if (scopeInfo.type === 'shop') {
      const shop = allShops.find((s) => s.shopId === scopeInfo.id);
      if (!shop) return null;
      return {
        scopeLabel: shop.name,
        scopeKind: 'shop',
        totalProducts: shop.totalProducts,
        inventoryUnits: shop.inventoryUnits,
        inventoryValue: shop.inventoryValue,
        monthlySales: shop.monthlySales,
        retailSold: shop.retailSold,
        wholesaleSold: shop.wholesaleSold,
      };
    }
    return null;
  }, [stats, scopeInfo, allShops, allWarehouses]);

  useEffect(() => {
    if (!metricsScope) return;
    const { type, id } = parseMetricsScope(metricsScope);
    const isValidWarehouse =
      type === 'warehouse' && allWarehouses.some((w) => w.warehouseId === id);
    const isValidShop = type === 'shop' && allShops.some((s) => s.shopId === id);
    if (!isValidWarehouse && !isValidShop) {
      setMetricsScope(SCOPE_ENTIRE);
    }
  }, [allShops, allWarehouses, metricsScope]);

  useEffect(() => {
    if (!shopPerformance.length) {
      setSelectedShopId('');
      return;
    }
    if (!shopPerformance.some((s) => s.shopId === selectedShopId)) {
      setSelectedShopId(shopPerformance[0].shopId);
    }
  }, [shopPerformance, selectedShopId]);

  const selectedShop = useMemo(
    () => shopPerformance.find((s) => s.shopId === selectedShopId) || null,
    [shopPerformance, selectedShopId],
  );

  const stockHealthPct = useMemo(() => {
    const total = Number(stats?.totalProducts) || 0;
    const oos = Number(stats?.outOfStock?.platformTotal) || 0;
    if (total <= 0) return 100;
    return Math.round(((total - oos) / total) * 100);
  }, [stats?.totalProducts, stats?.outOfStock?.platformTotal]);

  const outOfStockByShop = useMemo(() => {
    const rows = Array.isArray(stats?.outOfStock?.byShop) ? stats.outOfStock.byShop : [];
    return rows;
  }, [stats?.outOfStock?.byShop]);

  const chartMax = useMemo(() => {
    const vals = chartMonths.flatMap((m) => [
      Number(m.data?.monthlySales) || 0,
      Number(m.data?.retailSold) || 0,
      Number(m.data?.wholesaleSold) || 0,
    ]);
    return Math.max(1, ...vals);
  }, [chartMonths]);

  const statusCards = [
    {
      id: 'products',
      icon: METRIC_ICONS.products,
      tone: 'violet',
      tag:
        scopedMetrics?.scopeKind === 'warehouse'
          ? 'Warehouse'
          : scopedMetrics?.scopeKind === 'shop'
            ? 'Shop'
            : 'Catalog',
      label: 'Total products',
      value: formatCount(scopedMetrics?.totalProducts),
    },
    {
      id: 'units',
      icon: METRIC_ICONS.units,
      tone: 'blue',
      tag:
        scopedMetrics?.scopeKind === 'warehouse'
          ? 'Warehouse stock'
          : scopedMetrics?.scopeKind === 'shop'
            ? 'Shop stock'
            : 'All locations',
      label: 'Inventory units',
      value: formatCount(scopedMetrics?.inventoryUnits),
    },
    {
      id: 'value',
      icon: METRIC_ICONS.value,
      tone: 'pink',
      tag:
        scopedMetrics?.scopeKind === 'warehouse'
          ? 'Warehouse value'
          : scopedMetrics?.scopeKind === 'shop'
            ? 'Shop value'
            : 'All locations',
      label: 'Inventory value',
      value: scopedMetrics?.inventoryValue,
      valueKind: 'money',
    },
    {
      id: 'monthly',
      icon: METRIC_ICONS.monthly,
      tone: 'orange',
      tag: 'Completed',
      label: 'Monthly sales',
      value: scopedMetrics?.monthlySales,
      valueKind: 'money',
    },
    {
      id: 'retail',
      icon: METRIC_ICONS.retail,
      tone: 'mint',
      tag: 'Staff',
      label: 'Retail sold',
      value: scopedMetrics?.retailSold,
      valueKind: 'money',
    },
    {
      id: 'wholesale',
      icon: METRIC_ICONS.wholesale,
      tone: 'lavender',
      tag: 'Partners',
      label: 'Vendor sold',
      value: scopedMetrics?.wholesaleSold,
      valueKind: 'money',
    },
  ];

  const displayName = auth?.user || 'Admin';

  return (
    <div className="aod">
      {loading ? (
        <section className="aod__state-card">
          <p>Loading dashboard…</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="aod__state-card aod__state-card--error">
          <p>{error}</p>
          <button type="button" className="aod__btn aod__btn--ghost" onClick={() => reload()}>
            Retry
          </button>
        </section>
      ) : null}

      {!loading && !error && stats ? (
        <div className="aod__layout">
          <div className="aod__main">
            <section className="aod__banner">
              <div className="aod__banner-copy">
                <p className="aod__banner-eyebrow">Platform overview</p>
                <h2>Track inventory &amp; sales in one place</h2>
                <p>
                  Monitor stock levels, monthly revenue, and top-performing Shops across your wholesale
                  network.
                </p>
                <label className="aod__banner-month">
                  <span>Reporting period</span>
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                    {monthOptions.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="aod__banner-art" aria-hidden>
                <span className="aod__banner-star">✦</span>
              </div>
            </section>

            <div className="aod__metrics-toolbar">
              <label className="aod__scope-select">
                <span>View metrics for</span>
                <select
                  value={metricsScope}
                  onChange={(e) => setMetricsScope(e.target.value)}
                >
                  <option value={SCOPE_ENTIRE}>Entire inventory</option>
                  {allWarehouses.length > 0 ? (
                    <optgroup label="Warehouses">
                      {allWarehouses.map((warehouse) => (
                        <option
                          key={warehouse.warehouseId}
                          value={warehouseScopeId(warehouse.warehouseId)}
                        >
                          {warehouse.name} ({warehouse.city})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {allShops.length > 0 ? (
                    <optgroup label="Shops">
                      {allShops.map((shop) => (
                        <option key={shop.shopId} value={shopScopeId(shop.shopId)}>
                          {shop.name} ({shop.city})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              {scopedMetrics?.scopeLabel ? (
                <p className="aod__scope-hint">
                  Showing <strong>{scopedMetrics.scopeLabel}</strong> for{' '}
                  {formatMonthLabel(stats.month || selectedMonth)}.
                </p>
              ) : null}
            </div>

            <section className="aod__status-row" aria-label="Key metrics — 3 per row">
              {statusCards.map((card) => (
                <article key={card.id} className={`aod__status-card aod__status-card--${card.tone}`}>
                  <div className="aod__status-top">
                    <span className="aod__status-icon" aria-hidden>
                      {card.icon}
                    </span>
                    <span className="aod__status-tag">{card.tag}</span>
                  </div>
                  <strong className="aod__status-value">
                    {card.valueKind === 'money' ? <MoneyXaf value={card.value} /> : card.value}
                  </strong>
                  <span className="aod__status-label">{card.label}</span>
                </article>
              ))}
            </section>

            <section className="aod__panel aod__shops">
              <button
                type="button"
                className="aod__shops-toggle"
                aria-expanded={shopsOpen}
                onClick={() => setShopsOpen((v) => !v)}
              >
                <span>
                  <h3>Shop performance</h3>
                  <p>Best performing Shops — {formatMonthLabel(stats.month || selectedMonth)}</p>
                </span>
                <span className={`aod__chevron ${shopsOpen ? 'is-open' : ''}`} aria-hidden>
                  ▾
                </span>
              </button>

              {shopsOpen ? (
                <div className="aod__shops-body">
                  {shopPerformance.length === 0 ? (
                    <p className="aod__empty">No Shop sales recorded for this month yet.</p>
                  ) : (
                    <>
                      <label className="aod__shop-select">
                        <span>Select Shop</span>
                        <select
                          value={selectedShopId}
                          onChange={(e) => setSelectedShopId(e.target.value)}
                        >
                          {shopPerformance.map((shop, index) => (
                            <option key={shop.shopId} value={shop.shopId}>
                              #{index + 1} — {shop.name} ({shop.city}) — {formatMoneyXaf(shop.sold)}
                            </option>
                          ))}
                        </select>
                      </label>

                      {selectedShop ? (
                        <article className="aod__shop-highlight">
                          <div className="aod__shop-avatar" aria-hidden>
                            {(selectedShop.name || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="aod__shop-rank">
                              Rank #
                              {shopPerformance.findIndex((s) => s.shopId === selectedShop.shopId) + 1}
                            </span>
                            <h4>{selectedShop.name}</h4>
                            <p>{selectedShop.city}</p>
                          </div>
                          <div className="aod__shop-highlight-stats">
                            <div>
                              <span>Sold</span>
                              <strong>
                                <MoneyXaf value={selectedShop.sold} />
                              </strong>
                            </div>
                            <div>
                              <span>Orders</span>
                              <strong>{formatCount(selectedShop.orderCount)}</strong>
                            </div>
                          </div>
                        </article>
                      ) : null}

                      <div className="aod__lesson-table-wrap">
                        <table className="aod__lesson-table">
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Shop</th>
                              <th>City</th>
                              <th className="fit-numeric-cell">Sold</th>
                              <th>Orders</th>
                            </tr>
                          </thead>
                          <tbody>
                            {shopPerformance.map((shop, index) => (
                              <tr
                                key={shop.shopId}
                                className={shop.shopId === selectedShopId ? 'is-selected' : ''}
                                onClick={() => setSelectedShopId(shop.shopId)}
                              >
                                <td>
                                  <span className="aod__rank-pill">{index + 1}</span>
                                </td>
                                <td>
                                  <div className="aod__store-cell">
                                    <span className="aod__store-avatar" aria-hidden>
                                      {(shop.name || 'S').charAt(0).toUpperCase()}
                                    </span>
                                    {shop.name}
                                  </div>
                                </td>
                                <td>
                                  <span className="aod__type-pill aod__type-pill--city">{shop.city}</span>
                                </td>
                                <td className="fit-numeric-cell">
                                  <MoneyXaf value={shop.sold} />
                                </td>
                                <td>{formatCount(shop.orderCount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          </div>

          <aside className="aod__aside">
            <section className="aod__panel aod__stat-card">
              <h3>Statistic</h3>
              <div className="aod__stat-ring-wrap">
                <div
                  className="aod__stat-ring"
                  style={{ '--pct': stockHealthPct }}
                  role="img"
                  aria-label={`In stock ${stockHealthPct}%`}
                >
                  <div className="aod__stat-ring-inner">
                    <span className="aod__stat-ring-pct">{stockHealthPct}%</span>
                    <span className="aod__stat-ring-sub">in stock</span>
                  </div>
                </div>
              </div>
              <p className="aod__stat-greeting">
                {greetingForHour(new Date().getHours())}, <strong>{displayName}</strong>
              </p>
              <p className="aod__stat-sub">
                Continue building your wholesale operations. You&apos;re viewing{' '}
                {formatMonthLabel(stats.month || selectedMonth)}.
              </p>

              <div className="aod__bars" aria-label="Sales trend last 3 months">
                {chartMonths.map((month, idx) => {
                  const sales = Number(month.data?.monthlySales) || 0;
                  const height = Math.max(12, (sales / chartMax) * 100);
                  const tone = idx === chartMonths.length - 1 ? 'active' : idx === 1 ? 'mid' : 'soft';
                  return (
                    <div key={month.key} className="aod__bars-item">
                      <span className="aod__bars-value">{formatMoneyShort(sales)}</span>
                      <div className="aod__bars-track">
                        <div
                          className={`aod__bars-fill aod__bars-fill--${tone}`}
                          style={{ height: `${height}%` }}
                        />
                      </div>
                      <span className="aod__bars-label">{month.label}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="aod__panel aod__oos-panel">
              <div className="aod__panel-head">
                <h3>Out of stock</h3>
                <p className="aod__oos-lead">
                  Inventory is stock still at a Warehouse (not yet assigned to a Shop). A product can
                  be in stock in inventory but out of stock at a Shop.
                </p>
              </div>
              <ul className="aod__mentor-list aod__oos-list">
                <li>
                  <div className="aod__mentor-avatar aod__mentor-avatar--total" aria-hidden>
                    Σ
                  </div>
                  <div className="aod__mentor-copy">
                    <strong>Platform total</strong>
                    <span>All locations</span>
                  </div>
                  <span className="aod__mentor-amount aod__mentor-amount--accent">
                    {formatCount(stats?.outOfStock?.platformTotal)}
                  </span>
                </li>
                <li>
                  <div className="aod__mentor-avatar aod__mentor-avatar--inventory" aria-hidden>
                    W
                  </div>
                  <div className="aod__mentor-copy">
                    <strong>Inventory</strong>
                    <span>At Warehouse, not in a Shop</span>
                  </div>
                  <span className="aod__mentor-amount">
                    {formatCount(stats?.outOfStock?.inventory)}
                  </span>
                </li>
                <li>
                  <div className="aod__mentor-avatar aod__mentor-avatar--shops" aria-hidden>
                    S
                  </div>
                  <div className="aod__mentor-copy">
                    <strong>Shops total</strong>
                    <span>Assigned to Shops</span>
                  </div>
                  <span className="aod__mentor-amount">
                    {formatCount(stats?.outOfStock?.shops)}
                  </span>
                </li>
              </ul>

              {outOfStockByShop.length > 0 ? (
                <div className="aod__oos-shops">
                  <h4>By Shop</h4>
                  <ul className="aod__oos-shop-list">
                    {outOfStockByShop.map((row) => (
                      <li key={row.shopId}>
                        <span className="aod__oos-shop-name">{row.name}</span>
                        <span className="aod__oos-shop-city">{row.city}</span>
                        <strong>{formatCount(row.outOfStockCount)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="aod__empty aod__oos-empty">No out-of-stock products at Shops right now.</p>
              )}
            </section>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
