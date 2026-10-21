import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchWarehousesDashboardOverview } from '../../api/warehouseHubApi';
import { fetchWarehouses, subsForMainWarehouse, warehouseId } from '../../api/warehouseApi';
import { describeApiFailure } from '../../utils/apiBaseUrl';
import { subscribeProductCatalogUpdated } from '../../utils/productCatalogEvents';
import DeleteWarehouseModal from './DeleteWarehouseModal';
import EditLocationModal from './EditLocationModal';
import LocationCardMenu from './LocationCardMenu';
import {
  getWarehouseDashboardCacheKey,
  invalidateWarehouseDashboardCache,
  readWarehouseDashboardCache,
  writeWarehouseDashboardCache,
} from '../../utils/warehouseDashboardCache';
import { isUsaWarehouseCity } from '../../utils/warehouseDisplay';
import WarehouseHub from './WarehouseHub';
import './WarehouseDashboard.css';
import './WarehouseHub.css';
import './WarehousesPanel.css';

function greetingForHour(h) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function cityVisualClass(city) {
  const key = String(city || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  const map = {
    douala: 'douala',
    yaounde: 'yaounde',
    yaoundé: 'yaounde',
    bafoussam: 'bafoussam',
    bamenda: 'bamenda',
    limbe: 'limbe',
    usa: 'usa',
  };
  return map[key] ? `wh-location-card__visual--${map[key]}` : '';
}

function formatDateShort(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function RefreshIcon({ spinning = false }) {
  return (
    <svg
      className={`wh-dash-refresh-btn__icon${spinning ? ' wh-dash-refresh-btn__icon--spin' : ''}`}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  );
}

function buildFallbackOverview({ mainWarehouses = [], subWarehouses = [] }) {
  const mains = Array.isArray(mainWarehouses) ? mainWarehouses : [];
  const subs = Array.isArray(subWarehouses) ? subWarehouses : [];

  const enrich = (w, isMain) => {
    const id = warehouseId(w);
    const parent = w?.parentWarehouse;
    const parentName =
      !isMain && parent && typeof parent === 'object' ? parent.name || null : null;
    const shopCount = isMain ? subsForMainWarehouse(subs, id).length : 0;
    return {
      _id: w._id ?? w.id,
      id: w.id ?? w._id,
      name: w.name,
      type: w.type,
      city: w.city,
      address: w.address,
      isMain,
      isShop: !isMain,
      travellingCount: 0,
      arrivedCount: 0,
      shopCount,
      parentName,
    };
  };

  const locations = [...mains.map((w) => enrich(w, true)), ...subs.map((w) => enrich(w, false))];

  const chartByMain = mains.map((m) => {
    const id = warehouseId(m);
    return {
      mainId: id,
      name: m.name,
      city: m.city,
      travelling: 0,
      arrived: 0,
      shopCount: subsForMainWarehouse(subs, id).length,
    };
  });

  return {
    totals: {
      mainWarehouses: mains.length,
      shops: subs.length,
      travelling: 0,
      arrived: 0,
      pendingRequests: 0,
      travellingBatches: 0,
      awaitingPhotos: 0,
      stockHealthPct: 0,
    },
    locations,
    chartByMain,
    recentRequests: [],
    travellingBatches: [],
    recentProductTransfers: [],
    _fallback: true,
  };
}

function StatRing({ pct }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="wh-stat-ring__circle-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#ede9fe" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#6c5ce7"
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="wh-stat-ring__pct">{pct}%</span>
    </div>
  );
}

function StatusCardsSkeleton() {
  return (
    <div className="wh-status-row" aria-hidden>
      {[1, 2, 3].map((n) => (
        <article key={n} className="wh-status-card">
          <span
            className="wh-status-card__icon wh-skeleton"
            style={{ width: 42, height: 42, borderRadius: 12 }}
          />
          <div className="wh-status-card__body">
            <span className="wh-skeleton wh-skeleton--value" />
            <span className="wh-skeleton wh-skeleton--sub" />
          </div>
        </article>
      ))}
    </div>
  );
}

function LocationCardsSkeleton({ count = 3, gridWithAdd = false }) {
  return (
    <div
      className={`wh-locations-scroll ${gridWithAdd ? 'wh-locations-scroll--with-add' : ''}`.trim()}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="wh-skeleton-card">
          <div className="wh-skeleton wh-skeleton-card__top" />
          <div className="wh-skeleton-card__body">
            <span className="wh-skeleton wh-skeleton-card__line wh-skeleton-card__line--short" />
            <span className="wh-skeleton wh-skeleton-card__line wh-skeleton-card__line--title" />
            <span className="wh-skeleton wh-skeleton-card__line" />
          </div>
        </div>
      ))}
    </div>
  );
}

function getInitialDashboardState(cacheSessionKey) {
  const cached = cacheSessionKey ? readWarehouseDashboardCache(cacheSessionKey) : null;
  return {
    overview: cached?.overview ?? null,
    error: cached?.error ?? '',
    usingFallback: cached?.usingFallback ?? false,
    dataLoading: !cached?.overview,
  };
}

function AddLocationTile({ label, onClick }) {
  if (typeof onClick !== 'function') return null;
  return (
    <button
      type="button"
      className="wh-add-location-card"
      onClick={onClick}
      aria-label={`Add ${label}`}
    >
      <span className="wh-add-location-card__icon" aria-hidden>
        +
      </span>
      <span className="wh-add-location-card__label">{label}</span>
    </button>
  );
}

export default function WarehouseGridDashboard({
  variant = 'warehouse',
  cacheSessionKey = null,
  userName = 'Admin',
  pendingOfferOrdersCount = 0,
  onAddLocation,
  onAddBulk,
}) {
  const isWarehouseView = variant === 'warehouse';
  const isShopView = variant === 'shop';
  const axiosPrivate = useAxiosPrivate();
  const sessionKey = useMemo(
    () => getWarehouseDashboardCacheKey(cacheSessionKey),
    [cacheSessionKey],
  );
  const initial = useMemo(() => getInitialDashboardState(sessionKey), [sessionKey]);
  const [overview, setOverview] = useState(initial.overview);
  const [dataLoading, setDataLoading] = useState(initial.dataLoading);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(initial.error);
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [mainWarehouseList, setMainWarehouseList] = useState([]);
  const [usingFallback, setUsingFallback] = useState(initial.usingFallback);
  const fetchGenRef = useRef(0);
  const loadOverviewRef = useRef(null);

  const reloadWarehouseLists = useCallback(async () => {
    try {
      const data = await fetchWarehouses(axiosPrivate);
      setMainWarehouseList(Array.isArray(data.mainWarehouses) ? data.mainWarehouses : []);
    } catch {
      setMainWarehouseList([]);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    reloadWarehouseLists();
  }, [reloadWarehouseLists]);

  const loadOverview = useCallback(
    async ({ force = false, background = false } = {}) => {
      if (!force && !background && overview && sessionKey && readWarehouseDashboardCache(sessionKey)) {
        return;
      }

      const gen = ++fetchGenRef.current;
      if (background) {
        setRefreshing(true);
      } else if (!overview) {
        setDataLoading(true);
      } else {
        setRefreshing(true);
      }

      if (!background) {
        setError('');
        if (!overview) setUsingFallback(false);
      }

      try {
        const data = await fetchWarehousesDashboardOverview(axiosPrivate);
        if (gen !== fetchGenRef.current) return;

        const nextOverview = data && typeof data === 'object' ? data : null;
        setOverview(nextOverview);
        setUsingFallback(false);
        if (sessionKey && nextOverview) {
          writeWarehouseDashboardCache(sessionKey, { overview: nextOverview, error: '', usingFallback: false });
        }
      } catch (err) {
        if (gen !== fetchGenRef.current) return;

        const status = err?.response?.status;
        const canFallback =
          !status || status === 404 || status === 502 || status === 503 || err?.code === 'ERR_NETWORK';

        if (canFallback) {
          try {
            const wh = await fetchWarehouses(axiosPrivate);
            if (gen !== fetchGenRef.current) return;

            const fallbackOverview = buildFallbackOverview(wh);
            const fallbackMsg =
              status === 404
                ? 'Full dashboard stats are not on this API yet — showing warehouses from the list endpoint. Deploy the latest server for travelling counts and activity.'
                : describeApiFailure(err);

            setOverview(fallbackOverview);
            setUsingFallback(true);
            setError(fallbackMsg);
            if (sessionKey) {
              writeWarehouseDashboardCache(sessionKey, {
                overview: fallbackOverview,
                error: fallbackMsg,
                usingFallback: true,
              });
            }
            return;
          } catch (fallbackErr) {
            if (gen !== fetchGenRef.current) return;
            if (!background) {
              setOverview(null);
              setError(describeApiFailure(fallbackErr));
            }
            return;
          }
        }

        if (!background) {
          setOverview(null);
          setError(err?.response?.data?.message || err?.message || 'Failed to load warehouse overview.');
        }
      } finally {
        if (gen === fetchGenRef.current) {
          setDataLoading(false);
          setRefreshing(false);
        }
      }
    },
    [axiosPrivate, overview, sessionKey],
  );

  loadOverviewRef.current = loadOverview;

  useEffect(() => {
    const cached = sessionKey ? readWarehouseDashboardCache(sessionKey) : null;
    if (cached?.overview) {
      setOverview(cached.overview);
      setError(cached.error);
      setUsingFallback(cached.usingFallback);
      setDataLoading(false);
      return;
    }
    setOverview(null);
    setDataLoading(true);
    loadOverviewRef.current?.({ force: true });
  }, [sessionKey]);

  useEffect(() => {
    return subscribeProductCatalogUpdated(() => {
      invalidateWarehouseDashboardCache();
      loadOverviewRef.current?.({ force: true, background: true });
    });
  }, []);

  const totals = overview?.totals ?? {};
  const locations = useMemo(() => {
    const list = Array.isArray(overview?.locations) ? overview.locations : [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((loc) => {
      const hay = [loc.name, loc.city, loc.address, loc.parentName, loc.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [overview?.locations, search]);

  const mainLocations = useMemo(
    () => locations.filter((loc) => loc.isMain),
    [locations],
  );

  const shopLocations = useMemo(
    () => locations.filter((loc) => loc.isShop),
    [locations],
  );

  const chartByMain = useMemo(() => {
    const rows = Array.isArray(overview?.chartByMain) ? overview.chartByMain : [];
    const max = Math.max(1, ...rows.map((r) => (r.travelling || 0) + (r.arrived || 0)));
    return rows.map((r) => ({
      ...r,
      total: (r.travelling || 0) + (r.arrived || 0),
      heightPct: Math.round((((r.travelling || 0) + (r.arrived || 0)) / max) * 100),
    }));
  }, [overview?.chartByMain]);

  const chartByShopCity = useMemo(() => {
    const counts = new Map();
    shopLocations.forEach((loc) => {
      const city = String(loc?.city || 'Other').trim() || 'Other';
      counts.set(city, (counts.get(city) || 0) + 1);
    });
    const rows = [...counts.entries()].map(([city, count]) => ({ city, count }));
    const max = Math.max(1, ...rows.map((r) => r.count));
    return rows.map((r) => ({
      ...r,
      heightPct: Math.round((r.count / max) * 100),
    }));
  }, [shopLocations]);

  const visibleLocations = isWarehouseView ? mainLocations : shopLocations;
  const addTileLabel = isWarehouseView ? 'Warehouse' : 'Shop';

  const shopsForSidebar = useMemo(() => {
    return (Array.isArray(overview?.locations) ? overview.locations : [])
      .filter((l) => l.isShop)
      .slice(0, 6);
  }, [overview?.locations]);

  const mainLocationNames = useMemo(
    () => new Set(mainLocations.map((loc) => String(loc.name || '').trim()).filter(Boolean)),
    [mainLocations],
  );

  const activityRows = useMemo(() => {
    if (isWarehouseView) {
      const transfers = (
        Array.isArray(overview?.recentProductTransfers) ? overview.recentProductTransfers : []
      ).filter(
        (t) =>
          t.fromType === 'main' ||
          t.toType === 'main' ||
          mainLocationNames.has(String(t.fromName || '').trim()),
      );

      return transfers.map((t, index) => ({
        key: `xfer-${t.fromName}-${t.toName}-${t.productName}-${t.movedAt || index}`,
        kind: 'transfer',
        title: t.productName || 'Product',
        sub: [t.brand, t.capacity, `${t.units ?? 1} unit${(t.units ?? 1) === 1 ? '' : 's'}`]
          .filter(Boolean)
          .join(' · '),
        from: t.fromName,
        to: t.toName,
        tag: t.isActive ? 'In transit' : 'Transferred',
        tagClass: t.isActive ? 'wh-tag--travel' : 'wh-tag--arrived',
        date: t.movedAt,
      }));
    }

    const requests = (Array.isArray(overview?.recentRequests) ? overview.recentRequests : []).map(
      (r) => ({
        key: `req-${r._id}`,
        kind: 'request',
        title: r.productName || 'Stock request',
        sub: [r.brand, r.capacity].filter(Boolean).join(' · ') || r.shopName,
        from: r.shopName,
        to: r.mainName,
        tag: 'Pending',
        tagClass: 'wh-tag--pending',
        date: r.createdAt,
      }),
    );
    const batches = (Array.isArray(overview?.travellingBatches) ? overview.travellingBatches : []).map(
      (b) => ({
        key: `batch-${b.batchCode}`,
        kind: 'batch',
        title: b.batchCode || 'Bulk batch',
        sub: `${b.productCount ?? 0} products`,
        from: b.mainName,
        to: b.destName || 'Unassigned',
        tag: 'Travelling',
        tagClass: 'wh-tag--travel',
        date: null,
      }),
    );
    return [...requests, ...batches].slice(0, 10);
  }, [
    isWarehouseView,
    mainLocationNames,
    overview?.recentProductTransfers,
    overview?.recentRequests,
    overview?.travellingBatches,
  ]);

  const displayName = String(userName || 'Admin').trim() || 'Admin';
  const greeting = greetingForHour(new Date().getHours());
  const stockPct = Number(totals.stockHealthPct) || 0;

  const openLocation = (loc) => {
    setSelectedWarehouse({
      _id: loc._id ?? loc.id,
      id: loc.id ?? loc._id,
      name: loc.name,
      type: loc.isMain ? 'main' : 'sub',
      city: loc.city,
      address: loc.address,
      parentWarehouse: loc.parentWarehouse,
    });
  };

  const renderLocationCard = (loc) => {
    const id = warehouseId(loc);
    const isMain = loc.isMain;
    const cityClass = cityVisualClass(loc.city);
    const typeClass = isMain ? 'wh-location-card__visual--main' : 'wh-location-card__visual--shop';

    return (
      <article key={id} className="wh-location-card wh-location-card--with-menu">
        <button type="button" className="wh-location-card__open" onClick={() => openLocation(loc)}>
          <div className={`wh-location-card__visual ${typeClass} ${cityClass}`.trim()}>
            <LocationCardMenu
              label={`Options for ${loc.name || 'location'}`}
              onEdit={() => setEditTarget(loc)}
              onDelete={() => openDeleteModal(loc)}
            />
            <span className="wh-location-card__pin" aria-hidden>
              📍
            </span>
            <span className="wh-location-card__city">{loc.city || 'Other'}</span>
          </div>
          <div className="wh-location-card__body">
            <span className={`wh-location-card__tag ${isMain ? '' : 'wh-location-card__tag--shop'}`}>
              {isMain ? 'Main Warehouse' : 'Shop'}
            </span>
            <span className="wh-location-card__name">{loc.name}</span>
            <span className="wh-location-card__meta">
              {!isMain && loc.parentName ? <span>{loc.parentName}</span> : null}
              {isUsaWarehouseCity(loc.city) ? (
                (loc.travellingCount ?? 0) > 0 ? (
                  <span className="wh-location-card__alert">{loc.travellingCount} in transit</span>
                ) : null
              ) : loc.travellingCount > 0 ? (
                <span className="wh-location-card__alert">{loc.travellingCount} travelling</span>
              ) : null}
            </span>
          </div>
        </button>
      </article>
    );
  };

  const renderLocationRow = (items, emptyMessage) => {
    const addTile = <AddLocationTile label={addTileLabel} onClick={onAddLocation} />;
    if (items.length === 0) {
      return (
        <div className="wh-locations-scroll wh-locations-scroll--with-add">
          {addTile}
          {search ? (
            <p className="wh-empty wh-location-row__empty">No matches in this group.</p>
          ) : (
            <p className="wh-empty wh-location-row__empty">{emptyMessage}</p>
          )}
        </div>
      );
    }
    return (
      <div className="wh-locations-scroll wh-locations-scroll--with-add">
        {addTile}
        {items.map(renderLocationCard)}
      </div>
    );
  };

  const openDeleteModal = (loc) => {
    if (!loc) return;
    setDeleteTarget({
      _id: loc._id ?? loc.id,
      id: loc.id ?? loc._id,
      name: loc.name,
      type: loc.isMain ? 'main' : 'sub',
      city: loc.city,
      address: loc.address,
    });
  };

  if (selectedWarehouse) {
    return (
      <WarehouseHub
        warehouse={selectedWarehouse}
        onBack={() => {
          setSelectedWarehouse(null);
          invalidateWarehouseDashboardCache();
          loadOverview({ force: true, background: true });
        }}
      />
    );
  }

  const hasData = Boolean(overview);
  const showDataSections = hasData && !dataLoading;

  return (
    <div className="wh-dash-wrap">
      <DeleteWarehouseModal
        warehouse={deleteTarget}
        mainWarehouses={mainWarehouseList}
        onClose={() => setDeleteTarget(null)}
        onDeleted={async () => {
          setDeleteTarget(null);
          invalidateWarehouseDashboardCache();
          await Promise.all([loadOverview({ force: true, background: true }), reloadWarehouseLists()]);
        }}
      />

      <EditLocationModal
        open={Boolean(editTarget)}
        location={editTarget}
        variant={isWarehouseView ? 'warehouse' : 'shop'}
        mainWarehouses={mainWarehouseList}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          setEditTarget(null);
          invalidateWarehouseDashboardCache();
          await Promise.all([loadOverview({ force: true, background: true }), reloadWarehouseLists()]);
        }}
      />

      <div className="wh-dash-toolbar">
        <div className="wh-dash-toolbar__search-wrap">
          <input
            type="search"
            className="wh-search wh-search--toolbar"
            placeholder={isWarehouseView ? 'Search Warehouses…' : 'Search Shops…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search locations"
            disabled={dataLoading && !overview}
          />
        </div>
        <div className="wh-dash-toolbar__actions">
          {showDataSections ? (
            <button
              type="button"
              className="wh-dash-refresh-btn"
              disabled={refreshing}
              aria-busy={refreshing}
              aria-label={refreshing ? 'Updating dashboard' : 'Refresh dashboard'}
              onClick={() => {
                invalidateWarehouseDashboardCache();
                loadOverview({ force: true, background: true });
              }}
            >
              <RefreshIcon spinning={refreshing} />
              <span>{refreshing ? 'Updating…' : 'Refresh'}</span>
            </button>
          ) : null}
          {pendingOfferOrdersCount > 0 ? (
            <span className="wh-dash-toolbar__chip">
              {pendingOfferOrdersCount} pending offer order
              {pendingOfferOrdersCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
      </div>

      {!dataLoading && error && !overview ? (
        <div className="wh-dash-fatal wh-panel">
          <p className="wh-error">{error}</p>
          <p className="wh-empty" style={{ marginTop: '0.5rem' }}>
            If you develop locally, run the API in <code>server/</code> or set{' '}
            <code>VITE_API_ORIGINS</code> in a root <code>.env</code> file.
          </p>
          <button type="button" className="wh-hero__btn" onClick={() => loadOverview({ force: true })}>
            Retry
          </button>
        </div>
      ) : null}

      {showDataSections && usingFallback && error ? (
        <p className="wh-empty" style={{ marginBottom: '0.75rem' }}>
          {error}
        </p>
      ) : null}

      <div className="wh-dash-layout">
          <div className="wh-dash__main">
            <section className="wh-hero">
              <div className="wh-hero__inner">
                <h2>
                  {isWarehouseView
                    ? 'Manage stock at every Warehouse'
                    : 'Manage stock across every Shop'}
                </h2>
                <p>
                  {showDataSections ? (
                    isWarehouseView ? (
                      <>
                        {totals.mainWarehouses ?? 0} main Warehouse
                        {(totals.mainWarehouses ?? 0) === 1 ? '' : 's'}. Receive travelling bulk and
                        confirm arrivals with photos.
                      </>
                    ) : (
                      <>
                        {totals.shops ?? 0} Shop{(totals.shops ?? 0) === 1 ? '' : 's'}. Transfer stock,
                        fulfill requests, and track inventory at each retail point.
                      </>
                    )
                  ) : isWarehouseView ? (
                    <>Receive travelling bulk and confirm arrivals with photos.</>
                  ) : (
                    <>Transfer stock and track inventory at each retail Shop.</>
                  )}
                </p>
                {isWarehouseView && typeof onAddBulk === 'function' ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <button type="button" className="wh-hero__btn" onClick={onAddBulk}>
                      Add bulk stock →
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            {dataLoading ? <StatusCardsSkeleton /> : null}

            {showDataSections ? (
            <div className="wh-status-row">
              {isWarehouseView ? (
                <>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--travel" aria-hidden>
                      🚚
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">In transit</span>
                      <span className="wh-status-card__value">{totals.travelling ?? 0} units</span>
                      <span className="wh-status-card__sub">
                        {totals.travellingBatches ?? 0} bulk batch
                        {(totals.travellingBatches ?? 0) === 1 ? '' : 'es'}
                      </span>
                    </div>
                  </article>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--request" aria-hidden>
                      📋
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">Shop requests</span>
                      <span className="wh-status-card__value">{totals.pendingRequests ?? 0} pending</span>
                      <span className="wh-status-card__sub">Awaiting Warehouse approval</span>
                    </div>
                  </article>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--stock" aria-hidden>
                      📦
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">At Warehouse</span>
                      <span className="wh-status-card__value">{totals.arrived ?? 0} arrived</span>
                      <span className="wh-status-card__sub">
                        {totals.awaitingPhotos ?? 0} travelling without photos
                      </span>
                    </div>
                  </article>
                </>
              ) : (
                <>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--request" aria-hidden>
                      🏪
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">Retail Shops</span>
                      <span className="wh-status-card__value">{totals.shops ?? 0}</span>
                      <span className="wh-status-card__sub">Active retail locations</span>
                    </div>
                  </article>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--travel" aria-hidden>
                      📋
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">Stock requests</span>
                      <span className="wh-status-card__value">{totals.pendingRequests ?? 0} pending</span>
                      <span className="wh-status-card__sub">Awaiting Warehouse transfer</span>
                    </div>
                  </article>
                  <article className="wh-status-card">
                    <span className="wh-status-card__icon wh-status-card__icon--stock" aria-hidden>
                      🚚
                    </span>
                    <div className="wh-status-card__body">
                      <span className="wh-status-card__label">In transit</span>
                      <span className="wh-status-card__value">{totals.travelling ?? 0} units</span>
                      <span className="wh-status-card__sub">Moving between locations</span>
                    </div>
                  </article>
                </>
              )}
            </div>
            ) : null}

            <section className="wh-location-rows">
              <div className="wh-section-head">
                <h3>{isWarehouseView ? 'Warehouses' : 'Shops'}</h3>
                <span className="wh-location-row__count">
                  {visibleLocations.length} {isWarehouseView ? 'Warehouse' : 'Shop'}
                  {visibleLocations.length === 1 ? '' : 's'}
                </span>
              </div>

              {dataLoading ? (
                <div className="wh-location-row">
                  <LocationCardsSkeleton count={isWarehouseView ? 2 : 4} gridWithAdd />
                </div>
              ) : null}

              {showDataSections && visibleLocations.length === 0 && !search ? (
                renderLocationRow(
                  [],
                  isWarehouseView
                    ? 'No Warehouses yet. Use the + tile to add your first main Warehouse.'
                    : 'No Shops yet. Use the + tile to add your first Shop.',
                )
              ) : null}
              {showDataSections && visibleLocations.length === 0 && search ? (
                renderLocationRow([], 'No locations match your search.')
              ) : null}

              {showDataSections && visibleLocations.length > 0 ? (
                <div className="wh-location-row">
                  {renderLocationRow(
                    visibleLocations,
                    isWarehouseView
                      ? 'No Warehouses yet. Use the + tile to add your first main Warehouse.'
                      : 'No Shops yet. Use the + tile to add your first Shop.',
                  )}
                </div>
              ) : null}
            </section>

            <section className="wh-panel">
              <div className="wh-section-head">
                <h3>{isWarehouseView ? 'Product transfers' : 'Recent activity'}</h3>
              </div>
              {dataLoading ? (
                <div aria-hidden>
                  {[1, 2, 3].map((n) => (
                    <span
                      key={n}
                      className="wh-skeleton"
                      style={{ display: 'block', height: 36, marginBottom: 8 }}
                    />
                  ))}
                </div>
              ) : activityRows.length === 0 ? (
                <p className="wh-empty">
                  {isWarehouseView
                    ? 'No product transfers yet. Send stock between warehouses or to shops from a warehouse hub.'
                    : 'No pending requests or travelling batches right now.'}
                </p>
              ) : (
                <table className="wh-activity-table">
                  <thead>
                    <tr>
                      <th>Source</th>
                      <th>Type</th>
                      <th>Description</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.map((row) => (
                      <tr key={row.key}>
                        <td>
                          <strong>{row.from || '—'}</strong>
                          {row.to ? (
                            <>
                              <br />
                              <span className="wh-status-card__sub">→ {row.to}</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <span className={`wh-tag ${row.tagClass}`}>{row.tag}</span>
                        </td>
                        <td>
                          <strong>{row.title}</strong>
                          {row.sub ? (
                            <>
                              <br />
                              <span className="wh-status-card__sub">{row.sub}</span>
                            </>
                          ) : null}
                        </td>
                        <td>{formatDateShort(row.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <aside className="wh-dash__aside">
            <section className="wh-panel wh-stat-ring">
              {dataLoading ? (
                <div className="wh-skeleton wh-skeleton--ring" aria-hidden />
              ) : (
                <StatRing pct={stockPct} />
              )}
              <h4>
                {greeting} {displayName.split(' ')[0]} 🔥
              </h4>
              <p>
                {dataLoading ? (
                  <span className="wh-skeleton" style={{ display: 'block', height: 40 }} aria-hidden />
                ) : isWarehouseView ? (
                  <>
                    {stockPct}% of tracked stock is marked arrived at a Warehouse.
                    {totals.awaitingPhotos > 0
                      ? ` ${totals.awaitingPhotos} unit(s) still need photos after receipt.`
                      : ''}
                  </>
                ) : (
                  <>
                    {totals.shops ?? 0} Shop{(totals.shops ?? 0) === 1 ? '' : 's'} on the platform.
                    {totals.pendingRequests > 0
                      ? ` ${totals.pendingRequests} stock request(s) awaiting fulfillment.`
                      : ' All stock requests are up to date.'}
                  </>
                )}
              </p>
            </section>

            <section className="wh-panel">
              <div className="wh-section-head">
                <h3>{isWarehouseView ? 'Stock by region' : 'Shops by town'}</h3>
              </div>
              {dataLoading ? (
                <div className="wh-chart" aria-hidden>
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="wh-chart__item">
                      <div className="wh-skeleton wh-skeleton--bar" />
                      <span className="wh-skeleton" style={{ width: 32, height: 10, marginTop: 6 }} />
                    </div>
                  ))}
                </div>
              ) : isWarehouseView ? (
                chartByMain.length === 0 ? (
                  <p className="wh-empty">Add a main Warehouse to see regional stock.</p>
                ) : (
                  <div className="wh-chart" role="img" aria-label="Stock units by main warehouse region">
                    {chartByMain.map((row) => (
                      <div key={row.mainId} className="wh-chart__item">
                        <div
                          className="wh-chart__bar"
                          style={{ height: `${Math.max(12, row.heightPct)}%` }}
                          title={
                            isUsaWarehouseCity(row.city)
                              ? `${row.total} units (${row.arrived} on hand, ${row.travelling} in transit)`
                              : `${row.total} units (${row.travelling} travelling, ${row.arrived} arrived)`
                          }
                        />
                        <span className="wh-chart__label">{row.city || row.name}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : chartByShopCity.length === 0 ? (
                <p className="wh-empty">Add a Shop to see town breakdown.</p>
              ) : (
                <div className="wh-chart" role="img" aria-label="Shops per town">
                  {chartByShopCity.map((row) => (
                    <div key={row.city} className="wh-chart__item">
                      <div
                        className="wh-chart__bar"
                        style={{ height: `${Math.max(12, row.heightPct)}%` }}
                        title={`${row.count} Shop${row.count === 1 ? '' : 's'}`}
                      />
                      <span className="wh-chart__label">{row.city}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {isShopView ? (
              <section className="wh-panel">
                <div className="wh-section-head">
                  <h3>Quick access</h3>
                </div>
                {dataLoading ? (
                  <ul className="wh-shop-list" aria-hidden>
                    {[1, 2, 3].map((n) => (
                      <li key={n}>
                        <span className="wh-skeleton" style={{ width: 36, height: 36, borderRadius: '50%' }} />
                        <span className="wh-skeleton" style={{ flex: 1, height: 32 }} />
                      </li>
                    ))}
                  </ul>
                ) : shopsForSidebar.length === 0 ? (
                  <p className="wh-empty">No Shops yet.</p>
                ) : (
                  <ul className="wh-shop-list">
                    {shopsForSidebar.map((shop) => {
                      const id = warehouseId(shop);
                      const initial = (shop.name || '?').charAt(0).toUpperCase();
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            className="wh-shop-list__avatar"
                            style={{ border: 'none', cursor: 'pointer' }}
                            onClick={() => openLocation(shop)}
                            aria-label={`Open ${shop.name}`}
                          >
                            {initial}
                          </button>
                          <div className="wh-shop-list__info">
                            <strong>{shop.name}</strong>
                            <span>
                              {shop.city || 'Other'}
                              {shop.parentName ? ` · ${shop.parentName}` : ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="wh-hero__btn"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.72rem' }}
                            onClick={() => openLocation(shop)}
                          >
                            Open
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}
          </aside>
        </div>
    </div>
  );
}
