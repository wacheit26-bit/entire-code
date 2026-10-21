import { useEffect, useMemo, useState } from 'react';
import { normalizeOrderStatus, orderAmount } from '../../utils/orderDisplay';
import MoneyXaf from '../MoneyXaf';
import { formatMonthLabel, toMonthKey } from '../../utils/orderMonthUtils';
import {
  buildDirectSalesSeries,
  buildMonthlyPhoneSalesSeries,
  defaultSalesMonthKey,
  summarizeDirectSales,
  summarizePhoneSales,
} from '../../utils/salespersonMonthlySales';
import SalesGeneralInventory from './SalesGeneralInventory';

const DASH_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'direct-sales', label: 'Direct sales' },
  { id: 'general-inventory', label: 'General inventory' },
];

export default function SalesShopDashboard({ shop, stats = {}, orders = [] }) {
  const shopOrders = orders || [];
  const [dashTab, setDashTab] = useState('overview');

  const received = shopOrders.filter((o) => normalizeOrderStatus(o?.status) === 'received');
  const accepted = shopOrders.filter((o) => normalizeOrderStatus(o?.status) === 'accepted');
  const receivedTotal = received.reduce((s, o) => s + orderAmount(o), 0);
  const acceptedTotal = accepted.reduce((s, o) => s + orderAmount(o), 0);

  const monthlySeries = useMemo(() => buildMonthlyPhoneSalesSeries(shopOrders), [shopOrders]);
  const directSalesSeries = useMemo(() => buildDirectSalesSeries(shopOrders), [shopOrders]);

  const [selectedMonth, setSelectedMonth] = useState('');
  const [directSalesMonth, setDirectSalesMonth] = useState('');

  useEffect(() => {
    if (selectedMonth && monthlySeries.some((m) => m.monthKey === selectedMonth)) return;
    setSelectedMonth(defaultSalesMonthKey(shopOrders));
  }, [shopOrders, monthlySeries, selectedMonth]);

  useEffect(() => {
    if (directSalesMonth && directSalesSeries.some((m) => m.monthKey === directSalesMonth)) return;
    setDirectSalesMonth(directSalesSeries[0]?.monthKey || toMonthKey(new Date()));
  }, [directSalesSeries, directSalesMonth]);

  const monthSales = useMemo(
    () => summarizePhoneSales(shopOrders, { monthKey: selectedMonth }),
    [shopOrders, selectedMonth],
  );

  const directSalesStats = useMemo(
    () => summarizeDirectSales(shopOrders, { monthKey: directSalesMonth }),
    [shopOrders, directSalesMonth],
  );

  const allTimeDirectSales = useMemo(() => summarizeDirectSales(shopOrders), [shopOrders]);

  const monthLabel = selectedMonth ? formatMonthLabel(selectedMonth) : 'This month';
  const directMonthLabel = directSalesMonth ? formatMonthLabel(directSalesMonth) : 'This month';

  return (
    <div className="sales-shop-dash">
      <div className="sales-shop-dash__tabs" role="tablist" aria-label="Dashboard sections">
        {DASH_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={dashTab === item.id}
            className={`sales-shop-dash__tab ${dashTab === item.id ? 'is-active' : ''}`}
            onClick={() => setDashTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {dashTab === 'overview' ? (
        <>
          <section className="wh-panel sales-shop-dash__panel">
            <header className="sales-shop-dash__head">
              <h2>{shop?.name || 'Shop dashboard'}</h2>
              <p>
                {shop?.city || 'Other'}
                {shop?.address ? ` · ${shop.address}` : ''}
              </p>
            </header>

            <div className="sales-shop-dash__grid">
              <article className="sales-kpi-card">
                <span>Units at shop</span>
                <strong>{stats.unitsAtShop ?? 0}</strong>
              </article>
          <article className="sales-kpi-card">
            <span>In transit</span>
            <strong>{stats.travellingCount ?? 0}</strong>
            {(stats.travellingCount ?? 0) > 0 ? (
              <small>Open Inventory tab to accept</small>
            ) : null}
          </article>
              <article className="sales-kpi-card">
                <span>Pending requests</span>
                <strong>{stats.pendingRequestCount ?? 0}</strong>
              </article>
              <article className="sales-kpi-card">
                <span>Open orders</span>
                <strong>{received.length}</strong>
              </article>
              <article className="sales-kpi-card">
                <span>Received value</span>
                <strong>
                  <MoneyXaf value={receivedTotal} />
                </strong>
              </article>
              <article className="sales-kpi-card">
                <span>Accepted value</span>
                <strong>
                  <MoneyXaf value={acceptedTotal} />
                </strong>
              </article>
            </div>
          </section>

          <section className="wh-panel sales-shop-dash__panel sales-shop-dash__phones">
            <div className="sales-shop-dash__phones-head">
              <div>
                <h3>Total phones sold — monthly</h3>
                <p>Accepted sales at this shop. Vendor = orders through the site. Retail = direct in-shop sales.</p>
              </div>
              <label className="sales-shop-dash__month">
                <span>Month</span>
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {monthlySeries.length === 0 ? <option value={selectedMonth}>{monthLabel}</option> : null}
                  {monthlySeries.map((m) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="sales-shop-dash__phone-kpis">
              <article className="sales-shop-dash__phone-kpi sales-shop-dash__phone-kpi--total">
                <span>Total phones sold</span>
                <strong>{monthSales.totalPhones}</strong>
                <small>{monthLabel}</small>
              </article>
              <article className="sales-shop-dash__phone-kpi sales-shop-dash__phone-kpi--wholesale">
                <span>Vendor</span>
                <strong>{monthSales.wholesalePhones}</strong>
                <small>Ordered through the site</small>
              </article>
              <article className="sales-shop-dash__phone-kpi sales-shop-dash__phone-kpi--retail">
                <span>Retail</span>
                <strong>{monthSales.retailPhones}</strong>
                <small>Sold directly in shop</small>
              </article>
              <article className="sales-shop-dash__phone-kpi">
                <span>Sales value</span>
                <strong>
              <MoneyXaf value={monthSales.salesValue} />
            </strong>
                <small>Accepted order totals</small>
              </article>
            </div>
          </section>

          <section className="wh-panel sales-shop-dash__panel">
            <h3>Monthly sales</h3>
            <p className="sales-shop-dash__monthly-lead">All phones sold at this shop, grouped by month.</p>
            {monthlySeries.length === 0 ? (
              <p className="sales-hint">No accepted sales recorded for this shop yet.</p>
            ) : (
              <div className="sales-table-wrap">
                <table className="sales-table sales-shop-dash__monthly-table">
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Total phones</th>
                      <th>Vendor</th>
                      <th>Retail</th>
                      <th className="fit-numeric-cell">Sales value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySeries.map((row) => (
                      <tr key={row.monthKey} className={row.monthKey === selectedMonth ? 'is-selected-month' : ''}>
                        <td>{row.label}</td>
                        <td>{row.totalPhones}</td>
                        <td>{row.wholesalePhones}</td>
                        <td>{row.retailPhones}</td>
                        <td className="fit-numeric-cell">
                          <MoneyXaf value={row.salesValue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {dashTab === 'direct-sales' ? (
        <section className="wh-panel sales-shop-dash__panel sales-shop-dash__direct">
          <div className="sales-shop-dash__phones-head">
            <div>
              <h3>Direct sales</h3>
              <p>In-shop retail and vendor sales recorded through the Sales tab at this shop.</p>
            </div>
            <label className="sales-shop-dash__month">
              <span>Month</span>
              <select value={directSalesMonth} onChange={(e) => setDirectSalesMonth(e.target.value)}>
                {directSalesSeries.length === 0 ? (
                  <option value={directSalesMonth}>{directMonthLabel}</option>
                ) : null}
                {directSalesSeries.map((m) => (
                  <option key={m.monthKey} value={m.monthKey}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="sales-shop-dash__phone-kpis">
            <article className="sales-shop-dash__phone-kpi sales-shop-dash__phone-kpi--retail">
              <span>Products sold (direct)</span>
              <strong>{directSalesStats.totalProducts}</strong>
              <small>{directMonthLabel}</small>
            </article>
            <article className="sales-shop-dash__phone-kpi sales-shop-dash__phone-kpi--total">
              <span>Revenue (direct)</span>
              <strong>
                <MoneyXaf value={directSalesStats.totalRevenue} />
              </strong>
              <small>{directMonthLabel}</small>
            </article>
            <article className="sales-shop-dash__phone-kpi">
              <span>All-time products sold</span>
              <strong>{allTimeDirectSales.totalProducts}</strong>
              <small>Since records began</small>
            </article>
            <article className="sales-shop-dash__phone-kpi">
              <span>All-time direct revenue</span>
              <strong>
                <MoneyXaf value={allTimeDirectSales.totalRevenue} />
              </strong>
              <small>Since records began</small>
            </article>
          </div>

          {directSalesSeries.length === 0 ? (
            <p className="sales-hint">No direct sales recorded for this shop yet.</p>
          ) : (
            <div className="sales-table-wrap">
              <table className="sales-table sales-shop-dash__monthly-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Products sold</th>
                    <th className="fit-numeric-cell">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {directSalesSeries.map((row) => (
                    <tr
                      key={row.monthKey}
                      className={row.monthKey === directSalesMonth ? 'is-selected-month' : ''}
                    >
                      <td>{row.label}</td>
                      <td>{row.totalProducts}</td>
                      <td className="fit-numeric-cell">
                        <MoneyXaf value={row.totalRevenue} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {dashTab === 'general-inventory' ? <SalesGeneralInventory selectedShop={shop} /> : null}
    </div>
  );
}
