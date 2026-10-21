import { useCallback, useEffect, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchMyAssignedShops, fetchMyShopDetail, fetchMyShopProducts } from '../../api/salesShopApi';
import { warehouseId } from '../../api/warehouseApi';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import { isProductTravelling, productLocationDisplay } from '../../utils/productTravelRoute';
import '../shared/ProductTravelRoute.css';
import './SalespersonShopsPanel.css';

function shopKey(shop) {
  return warehouseId(shop);
}

export default function SalespersonShopsPanel() {
  const client = useAxiosPrivate();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [products, setProducts] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadShops = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchMyAssignedShops(client);
      setShops(rows);
      if (rows.length === 1) {
        setSelectedId(shopKey(rows[0]));
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load your Shops.');
      setShops([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const loadDetail = useCallback(
    async (id) => {
      if (!id) {
        setDetail(null);
        setProducts([]);
        return;
      }
      setDetailLoading(true);
      setError('');
      try {
        const [hub, stock] = await Promise.all([
          fetchMyShopDetail(client, id),
          fetchMyShopProducts(client, id),
        ]);
        setDetail(hub);
        setProducts(stock.products);
      } catch (e) {
        setDetail(null);
        setProducts([]);
        setError(e?.response?.data?.message || e?.message || 'Failed to load Shop details.');
      } finally {
        setDetailLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const selectedShop = shops.find((s) => shopKey(s) === selectedId);
  const stats = detail?.stats || {};

  return (
    <div className="sales-shops">
      <header className="sales-shops__intro">
        <h2>My Shops</h2>
        <p>You only see Retail Shops assigned to you by an admin.</p>
        <button type="button" className="sales-refresh-btn" onClick={loadShops}>
          Refresh
        </button>
      </header>

      {error ? <p className="sales-alert sales-alert--err">{error}</p> : null}
      {loading ? <p className="sales-hint">Loading your Shops…</p> : null}

      {!loading && shops.length === 0 ? (
        <div className="sales-shops__empty wh-panel">
          <p>
            <strong>No Shops assigned yet.</strong>
          </p>
          <p>Ask an admin to assign you to one or more Shops in the Sales Team section.</p>
        </div>
      ) : null}

      {!loading && shops.length > 0 ? (
        <div className="sales-shops__layout">
          <aside className="sales-shops__list" aria-label="Your assigned Shops">
            {shops.map((shop) => {
              const id = shopKey(shop);
              const active = id === selectedId;
              return (
                <button
                  key={id}
                  type="button"
                  className={`sales-shops__card ${active ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(id)}
                >
                  <strong>{shop.name}</strong>
                  <span>{shop.city || 'Other'}</span>
                  {shop.address ? <span className="sales-shops__card-addr">{shop.address}</span> : null}
                  <span className="sales-shops__card-meta">
                    {shop.arrivedCount ?? 0} on hand · {shop.travellingCount ?? 0} travelling
                  </span>
                </button>
              );
            })}
          </aside>

          <section className="sales-shops__detail wh-panel">
            {!selectedId ? (
              <p className="sales-hint">Select a Shop to view details.</p>
            ) : detailLoading ? (
              <p className="sales-hint">Loading Shop details…</p>
            ) : (
              <>
                <h3>{selectedShop?.name || detail?.shop?.name}</h3>
                <p className="sales-shops__detail-meta">
                  {selectedShop?.city || detail?.shop?.city || 'Other'}
                  {selectedShop?.address || detail?.shop?.address
                    ? ` · ${selectedShop?.address || detail?.shop?.address}`
                    : ''}
                </p>

                <div className="sales-shops__stats">
                  <article>
                    <span>In transit</span>
                    <strong>{stats.travellingCount ?? 0}</strong>
                  </article>
                  <article>
                    <span>At Shop</span>
                    <strong>{stats.arrivedCount ?? 0}</strong>
                  </article>
                  <article>
                    <span>Pending requests</span>
                    <strong>{stats.pendingRequestCount ?? 0}</strong>
                  </article>
                </div>

                {detail?.parentMain ? (
                  <p className="sales-shops__linked">
                    Linked regional Warehouse: <strong>{detail.parentMain.name}</strong>
                  </p>
                ) : null}

                {Array.isArray(detail?.teamAtShop) && detail.teamAtShop.length > 1 ? (
                  <p className="sales-shops__team">
                    Also assigned here:{' '}
                    {detail.teamAtShop
                      .map((u) => u.name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : null}

                <h4>Stock at this Shop</h4>
                {products.length === 0 ? (
                  <p className="sales-hint">No products recorded at this location yet.</p>
                ) : (
                  <div className="sales-table-wrap">
                    <table className="sales-table">
                      <thead>
                        <tr>
                          <th>Product</th>
                          <th>Status</th>
                          <th>Qty</th>
                          <th>Location / route</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((p) => {
                          const pid = String(p._id ?? p.id ?? p.product_name);
                          return (
                            <tr key={pid}>
                              <td>{p.product_name || '—'}</td>
                              <td>
                                {p.shipmentStatus || '—'}
                                {isProductTravelling(p) ? (
                                  <ProductTravelRoute
                                    product={p}
                                    className="product-travel-route--block product-travel-route--compact"
                                  />
                                ) : null}
                              </td>
                              <td>{Math.max(0, Number(p.stock) || 0)}</td>
                              <td>{productLocationDisplay(p)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
