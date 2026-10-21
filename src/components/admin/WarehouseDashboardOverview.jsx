import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchWarehouses, subsForMainWarehouse, warehouseId } from '../../api/warehouseApi';
import './WarehousesPanel.css';

export default function WarehouseDashboardOverview({ onManageWarehouses }) {
  const axiosPrivate = useAxiosPrivate();
  const [mainWarehouses, setMainWarehouses] = useState([]);
  const [subWarehouses, setSubWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouses(axiosPrivate);
      setMainWarehouses(Array.isArray(data.mainWarehouses) ? data.mainWarehouses : []);
      setSubWarehouses(Array.isArray(data.subWarehouses) ? data.subWarehouses : []);
    } catch (err) {
      setMainWarehouses([]);
      setSubWarehouses([]);
      setError(err?.response?.data?.message || err?.message || 'Failed to load warehouses.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    reload();
  }, [reload]);

  const subsByMain = useMemo(() => {
    const map = new Map();
    mainWarehouses.forEach((main) => {
      map.set(warehouseId(main), subsForMainWarehouse(subWarehouses, warehouseId(main)));
    });
    return map;
  }, [mainWarehouses, subWarehouses]);

  const mainCount = mainWarehouses.length;
  const subCount = subWarehouses.length;

  return (
    <div className="dash-content warehouse-dashboard">
      <section className="dash-panel">
        <h3>Warehouse Overview</h3>
        <p className="warehouses-panel__lead">
          Regional main Warehouses receive bulk stock. Shops under each main route products to local
          retail locations.
        </p>
        {typeof onManageWarehouses === 'function' ? (
          <button type="button" className="settings-btn" onClick={onManageWarehouses}>
            Manage warehouses
          </button>
        ) : null}
      </section>

      {loading ? (
        <section className="dash-panel">
          <p>Loading warehouses…</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="dash-panel">
          <p className="warehouses-panel__error">{error}</p>
          <button type="button" className="settings-btn" onClick={() => reload()}>
            Retry
          </button>
        </section>
      ) : null}

      {!loading && !error ? (
        <>
          <section className="dash-kpis">
            <article className="dash-kpi-card">
              <span>Regional main Warehouses</span>
              <strong>{mainCount}</strong>
            </article>
            <article className="dash-kpi-card">
              <span>Shops</span>
              <strong>{subCount}</strong>
            </article>
          </section>

          {mainCount === 0 ? (
            <section className="dash-panel">
              <p className="warehouses-empty">No main warehouses yet. Add your first regional main warehouse.</p>
            </section>
          ) : (
            mainWarehouses.map((main) => {
              const mainId = warehouseId(main);
              const subs = subsByMain.get(mainId) || [];
              return (
                <section key={mainId} className="dash-panel warehouses-region-card">
                  <div className="warehouses-region-card__header">
                    <div>
                      <h4>{main.name}</h4>
                      <p className="warehouses-region-card__meta">
                        Main warehouse · {main.city || 'Other'}
                        {main.address ? ` · ${main.address}` : ''}
                      </p>
                    </div>
                  </div>

                  {subs.length === 0 ? (
                    <p className="warehouses-empty">No Shops under this main yet.</p>
                  ) : (
                    <ul className="warehouses-list">
                      {subs.map((sub) => {
                        const subId = warehouseId(sub);
                        return (
                          <li key={subId} className="warehouses-list__item">
                            <div>
                              <strong>{sub.name}</strong>
                              <span className="warehouses-list__meta">
                                Shop · {sub.city || 'Other'}
                                {sub.address ? ` · ${sub.address}` : ''}
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </>
      ) : null}
    </div>
  );
}
