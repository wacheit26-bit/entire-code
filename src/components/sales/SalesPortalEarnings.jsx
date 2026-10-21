import { useEffect, useMemo, useState } from 'react';
import {
  SALESPERSON_EARNINGS_PER_PHONE,
  buildMonthlyPhoneSalesSeries,
  filterPortalEarningsOrders,
  summarizePhoneSales,
} from '../../utils/salespersonMonthlySales';
import MoneyXaf from '../MoneyXaf';
import { formatMonthLabel, toMonthKey } from '../../utils/orderMonthUtils';
import './SalesPortalEarnings.css';

export default function SalesPortalEarnings({ orders = [], shop = null, staffUserId, staffName = '' }) {
  const earningsOrders = useMemo(
    () => filterPortalEarningsOrders(orders, shop, staffUserId),
    [orders, shop, staffUserId],
  );

  const personalSeries = useMemo(
    () => buildMonthlyPhoneSalesSeries(earningsOrders),
    [earningsOrders],
  );

  const [selectedMonth, setSelectedMonth] = useState('');

  useEffect(() => {
    if (selectedMonth && personalSeries.some((m) => m.monthKey === selectedMonth)) return;
    setSelectedMonth(personalSeries[0]?.monthKey || toMonthKey(new Date()));
  }, [personalSeries, selectedMonth]);

  const monthStats = useMemo(
    () => summarizePhoneSales(earningsOrders, { monthKey: selectedMonth }),
    [earningsOrders, selectedMonth],
  );

  const monthLabel = selectedMonth ? formatMonthLabel(selectedMonth) : 'This month';

  return (
    <section className="sales-portal-earnings wh-panel">
      <header className="sales-portal-earnings__head">
        <h2>Monthly earnings</h2>
        <p>
          Your commission for {staffName ? `${staffName} — ` : ''}phones you sold and confirmed
          {shop?.name ? ` at ${shop.name}` : ''}. Each phone earns <MoneyXaf value={SALESPERSON_EARNINGS_PER_PHONE} />.
        </p>
      </header>

      <label className="sales-portal-earnings__month">
        <span>Month</span>
        <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
          {personalSeries.length === 0 ? (
            <option value={selectedMonth}>{monthLabel}</option>
          ) : null}
          {personalSeries.map((m) => (
            <option key={m.monthKey} value={m.monthKey}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      {personalSeries.length === 0 ? (
        <p className="sales-hint">
          No confirmed sales recorded for you at this shop yet. Direct sales and orders you accept will appear here.
        </p>
      ) : null}

      <div className="sales-portal-earnings__hero">
        <div>
          <span className="sales-portal-earnings__hero-label">Phones sold</span>
          <strong className="sales-portal-earnings__hero-qty">{monthStats.totalPhones}</strong>
        </div>
        <span className="sales-portal-earnings__hero-times">×</span>
        <div>
          <span className="sales-portal-earnings__hero-label">Rate</span>
          <strong>
            <MoneyXaf value={SALESPERSON_EARNINGS_PER_PHONE} />
          </strong>
        </div>
        <span className="sales-portal-earnings__hero-eq">=</span>
        <div className="sales-portal-earnings__hero-total">
          <span className="sales-portal-earnings__hero-label">Your earnings</span>
          <strong>
            <MoneyXaf value={monthStats.earnings} />
          </strong>
        </div>
      </div>

      <div className="sales-portal-earnings__split">
        <article>
          <span>Retail (direct in shop)</span>
          <strong>{monthStats.retailDirectInShopPhones}</strong>
        </article>
        <article>
          <span>Vendor (direct in shop)</span>
          <strong>{monthStats.wholesaleDirectInShopPhones}</strong>
        </article>
        <article>
          <span>Vendor (site order)</span>
          <strong>{monthStats.wholesaleSiteOrderPhones}</strong>
        </article>
      </div>

      {personalSeries.length > 1 ? (
        <div className="sales-portal-earnings__history">
          <h3>Earnings history</h3>
          <div className="sales-table-wrap">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Phones</th>
                  <th>Retail (direct in shop)</th>
                  <th>Vendor (direct in shop)</th>
                  <th>Vendor (site order)</th>
                  <th className="fit-numeric-cell">Earnings</th>
                </tr>
              </thead>
              <tbody>
                {personalSeries.map((row) => (
                  <tr key={row.monthKey} className={row.monthKey === selectedMonth ? 'is-selected-month' : ''}>
                    <td>{row.label}</td>
                    <td>{row.totalPhones}</td>
                    <td>{row.retailDirectInShopPhones}</td>
                    <td>{row.wholesaleDirectInShopPhones}</td>
                    <td>{row.wholesaleSiteOrderPhones}</td>
                    <td className="fit-numeric-cell">
                      <MoneyXaf value={row.earnings} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
