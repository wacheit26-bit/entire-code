import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { warehouseId } from '../../api/warehouseApi';
import { fetchMyShopIncoming, receiveMyShopStock } from '../../api/salesShopApi';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import { isProductTravelling } from '../../utils/productTravelRoute';
import '../shared/ProductTravelRoute.css';
import './SalesShopIncoming.css';

export default function SalesShopIncoming({ shop, onAccepted }) {
  const client = useAxiosPrivate();
  const shopId = warehouseId(shop);

  const [incoming, setIncoming] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');

  const loadIncoming = useCallback(async () => {
    if (!shopId) {
      setIncoming(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyShopIncoming(client, shopId);
      setIncoming(data);
    } catch (e) {
      setIncoming(null);
      setError(e?.response?.data?.message || e?.message || 'Failed to load incoming stock.');
    } finally {
      setLoading(false);
    }
  }, [client, shopId]);

  useEffect(() => {
    loadIncoming().catch(() => {});
  }, [loadIncoming]);

  const products = useMemo(
    () => (Array.isArray(incoming?.products) ? incoming.products : []),
    [incoming],
  );
  const batches = useMemo(
    () => (Array.isArray(incoming?.batches) ? incoming.batches : []),
    [incoming],
  );

  const acceptProduct = async (productId) => {
    if (!shopId || !productId) return;
    const key = String(productId);
    setBusyKey(key);
    setError('');
    setMessage('');
    try {
      const result = await receiveMyShopStock(client, shopId, { productIds: [productId] });
      setMessage(result?.message || 'Product accepted.');
      notifyProductCatalogUpdated();
      await Promise.all([loadIncoming(), onAccepted?.()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not accept product.');
    } finally {
      setBusyKey('');
    }
  };

  const acceptBatch = async (batchCode) => {
    const code = String(batchCode || '').trim();
    if (!shopId || !code) return;
    setBusyKey(`batch:${code}`);
    setError('');
    setMessage('');
    try {
      const result = await receiveMyShopStock(client, shopId, { batchCode: code });
      setMessage(result?.message || 'Batch accepted.');
      notifyProductCatalogUpdated();
      await Promise.all([loadIncoming(), onAccepted?.()]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not accept batch.');
    } finally {
      setBusyKey('');
    }
  };

  if (!shopId) return null;

  return (
    <section className="wh-panel sales-shop-incoming">
      <header className="sales-shop-incoming__head">
        <div>
          <h2>Incoming stock</h2>
          <p>Products in transit to {shop?.name || 'this shop'}. Accept them when they arrive.</p>
        </div>
        <button type="button" className="sales-refresh-btn" onClick={() => loadIncoming()}>
          Refresh
        </button>
      </header>

      {message ? <p className="sales-alert sales-alert--ok">{message}</p> : null}
      {error ? <p className="sales-alert sales-alert--err">{error}</p> : null}
      {loading ? <p className="sales-hint">Loading incoming stock…</p> : null}

      {!loading && products.length === 0 ? (
        <p className="sales-hint">No incoming products waiting to be accepted.</p>
      ) : null}

      {!loading && batches.length > 0 ? (
        <div className="sales-shop-incoming__batches">
          <h3>Bulk batches</h3>
          <ul className="sales-shop-incoming__batch-list">
            {batches.map((batch) => (
              <li key={batch.batchCode}>
                <div>
                  <code>{batch.batchCode}</code>
                  <span>
                    {batch.count} line{batch.count === 1 ? '' : 's'} · {batch.totalStock} unit
                    {batch.totalStock === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  className="sales-shop-incoming__accept-btn"
                  disabled={Boolean(busyKey)}
                  onClick={() => acceptBatch(batch.batchCode)}
                >
                  {busyKey === `batch:${batch.batchCode}` ? 'Accepting…' : 'Accept batch'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="sales-table-wrap">
          <table className="sales-table sales-shop-incoming__table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Brand</th>
                <th>Qty</th>
                <th>Route</th>
                <th>Batch</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const pid = String(p._id ?? p.id ?? '');
                const busy = busyKey === pid;
                return (
                  <tr key={pid}>
                    <td>
                      {p.product_name || '—'}
                      {p.capacity || p.color ? (
                        <span className="sales-shop-incoming__meta">
                          {[p.capacity, p.color].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </td>
                    <td>{p.brand || '—'}</td>
                    <td>{Math.max(0, Number(p.stock) || 0)}</td>
                    <td>
                      {isProductTravelling(p) ? (
                        <ProductTravelRoute
                          product={p}
                          className="product-travel-route--block product-travel-route--compact"
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{p.bulkBatchCode || '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="sales-shop-incoming__accept-btn"
                        disabled={Boolean(busyKey)}
                        onClick={() => acceptProduct(pid)}
                      >
                        {busy ? 'Accepting…' : 'Accept'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
