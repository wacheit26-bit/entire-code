import { useState } from 'react';
import MoneyXaf from '../MoneyXaf';
import './InventoryPanel.css';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-CM');
  } catch {
    return String(value);
  }
}

function warehouseLabel(wh) {
  if (!wh?.name) return '—';
  return wh.city ? `${wh.name} (${wh.city})` : wh.name;
}

export default function InventoryImeLookup({ onSearch }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const runSearch = async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (q.length < 3) {
      setError('Enter at least 3 characters of the IME.');
      setResult(null);
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await onSearch(q);
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err?.response?.data?.message || err?.message || 'IME lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="wh-panel wh-inventory-ime-lookup">
      <div className="wh-section-head">
        <h3>Search by IME</h3>
        <span className="wh-location-row__count">Serial / IME lookup</span>
      </div>
      <p className="wh-inventory-ime-lookup__lead">
        Find a device by IME. If it was sold, you will see product details and where the sale was recorded.
      </p>
      <form className="wh-inventory-ime-lookup__form" onSubmit={runSearch}>
        <input
          type="search"
          className="wh-search wh-inventory-ime-lookup__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter IME code…"
          autoComplete="off"
          aria-label="Search inventory by IME"
        />
        <button type="submit" className="wh-inventory-btn wh-inventory-btn--primary" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error ? (
        <p className="wh-inventory-alert wh-inventory-alert--error" role="alert">
          {error}
        </p>
      ) : null}

      {result?.status === 'sold_out' ? (
        <article className="wh-inventory-ime-card wh-inventory-ime-card--sold">
          <header className="wh-inventory-ime-card__head">
            <span className="wh-inventory-ime-card__badge wh-inventory-ime-card__badge--sold">Sold out</span>
            <code className="wh-inventory-ime-card__ime">{result.ime}</code>
          </header>
          <h4>{result.product?.productName || 'Product'}</h4>
          <p className="wh-inventory-ime-card__meta">
            {[result.product?.brand, result.product?.capacity, result.product?.color]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
          <dl className="wh-inventory-ime-card__details">
            <div>
              <dt>Sold to</dt>
              <dd>{result.sale?.customerName || result.sale?.buyerName || '—'}</dd>
            </div>
            <div>
              <dt>Sale type</dt>
              <dd>{result.sale?.saleType ? String(result.sale.saleType) : '—'}</dd>
            </div>
            <div>
              <dt>Sold at</dt>
              <dd>{formatWhen(result.sale?.soldAt)}</dd>
            </div>
            <div>
              <dt>Sold from / assigned to</dt>
              <dd>{result.sale?.soldWhereLabel || result.sale?.assignedWarehouseName || '—'}</dd>
            </div>
            {result.sale?.handledByName ? (
              <div>
                <dt>Handled by</dt>
                <dd>{result.sale.handledByName}</dd>
              </div>
            ) : null}
            {(result.sale?.listedPrice != null || result.product?.price != null) ? (
              <div>
                <dt>Listed price</dt>
                <dd>
                  <MoneyXaf
                    value={
                      result.sale?.listedPrice != null
                        ? result.sale.listedPrice
                        : result.product.price
                    }
                  />
                </dd>
              </div>
            ) : null}
            {Number(result.sale?.soldPrice) > 0 ? (
              <div>
                <dt>Sold price</dt>
                <dd>
                  <MoneyXaf value={result.sale.soldPrice} />
                </dd>
              </div>
            ) : null}
          </dl>
        </article>
      ) : null}

      {result?.status === 'in_inventory' && result.results?.length ? (
        <div className="wh-inventory-ime-results">
          <p className="wh-inventory-ime-lookup__count">
            {result.count} match{result.count === 1 ? '' : 'es'} for &ldquo;{result.query}&rdquo;
          </p>
          <div className="wh-inventory-table-wrap">
            <table className="wh-activity-table wh-inventory-table">
              <thead>
                <tr>
                  <th>IME</th>
                  <th>Product</th>
                  <th>Location</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th className="fit-numeric-cell">Price</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((row) => (
                  <tr key={`${row.productId}-${row.ime}`}>
                    <td>
                      <code>{row.ime}</code>
                    </td>
                    <td>
                      <strong>{row.productName}</strong>
                      <br />
                      <span className="wh-status-card__sub">
                        {[row.brand, row.capacity, row.color].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td>
                      {warehouseLabel(row.currentWarehouse)}
                      {row.destinationShop?.name ? (
                        <span className="wh-inventory-ime-card__sub">
                          → {warehouseLabel(row.destinationShop)}
                        </span>
                      ) : null}
                    </td>
                    <td>{row.stock}</td>
                    <td>
                      <span
                        className={`wh-inventory-ime-card__badge ${
                          row.status === 'available'
                            ? 'wh-inventory-ime-card__badge--ok'
                            : 'wh-inventory-ime-card__badge--warn'
                        }`}
                      >
                        {row.status === 'available' ? 'Available' : 'Out of stock'}
                      </span>
                    </td>
                    <td className="fit-numeric-cell">
                      {row.price > 0 ? <MoneyXaf value={row.price} /> : '—'}
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
