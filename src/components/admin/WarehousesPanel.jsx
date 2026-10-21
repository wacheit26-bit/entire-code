import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  createMainWarehouse,
  createSubWarehouse,
  fetchWarehouses,
  warehouseId,
} from '../../api/warehouseApi';
import DeleteWarehouseModal from './DeleteWarehouseModal';
import EditLocationModal from './EditLocationModal';
import LocationCardMenu from './LocationCardMenu';
import WarehouseProductsModal from './WarehouseProductsModal';
import './WarehouseDashboard.css';
import './WarehousesPanel.css';

const CITY_OPTIONS = [
  { value: 'Douala', label: 'Douala' },
  { value: 'Yaounde', label: 'Yaoundé' },
  { value: 'Bafoussam', label: 'Bafoussam' },
  { value: 'Bamenda', label: 'Bamenda' },
  { value: 'Limbe', label: 'Limbe' },
  { value: 'Buea', label: 'Buea' },
  { value: 'USA', label: 'USA' },
  { value: 'Other', label: 'Other' },
];

const EMPTY_MAIN = { name: '', city: 'Douala', address: '', description: '' };
const EMPTY_SHOP = { name: '', city: 'Douala', address: '', description: '' };

function shopParentLabel(shop) {
  const parent = shop?.parentWarehouse;
  if (!parent) return null;
  if (typeof parent === 'object') {
    return parent.name ? `${parent.name}${parent.city ? ` (${parent.city})` : ''}` : null;
  }
  return 'Linked Warehouse (legacy)';
}

function isUsaCity(city) {
  return String(city || '').trim().toUpperCase() === 'USA';
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

function SetupStatRing({ pct }) {
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

export default function WarehousesPanel({ mode = 'warehouse', onBack }) {
  const isWarehouseMode = mode === 'warehouse';
  const isShopMode = mode === 'shop';
  const axiosPrivate = useAxiosPrivate();
  const [mainWarehouses, setMainWarehouses] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mainForm, setMainForm] = useState(EMPTY_MAIN);
  const [shopForm, setShopForm] = useState(EMPTY_SHOP);
  const [savingMain, setSavingMain] = useState(false);
  const [savingShop, setSavingShop] = useState(false);
  const [viewingWarehouse, setViewingWarehouse] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [search, setSearch] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchWarehouses(axiosPrivate);
      setMainWarehouses(data.mainWarehouses);
      setShops(data.subWarehouses);
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load warehouses.';
      setError(String(msg));
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate]);

  useEffect(() => {
    reload();
  }, [reload]);

  const shopsSorted = useMemo(() => {
    return [...shops].sort((a, b) => {
      const ac = String(a?.city || '');
      const bc = String(b?.city || '');
      if (ac !== bc) return ac.localeCompare(bc);
      return String(a?.name || '').localeCompare(String(b?.name || ''));
    });
  }, [shops]);

  const mainsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mainWarehouses;
    return mainWarehouses.filter((w) => {
      const hay = [w.name, w.city, w.address].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [mainWarehouses, search]);

  const shopsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return shopsSorted;
    return shopsSorted.filter((w) => {
      const hay = [w.name, w.city, w.address, shopParentLabel(w)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [shopsSorted, search]);

  const cityCounts = useMemo(() => {
    const counts = new Map();
    const list = isWarehouseMode
      ? mainWarehouses
      : isShopMode
        ? shops
        : [...mainWarehouses, ...shops];
    list.forEach((loc) => {
      const city = String(loc?.city || 'Other').trim() || 'Other';
      counts.set(city, (counts.get(city) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count);
  }, [isWarehouseMode, isShopMode, mainWarehouses, shops]);

  const setupPct = useMemo(() => {
    if (isWarehouseMode) return mainWarehouses.length > 0 ? 100 : 0;
    if (isShopMode) return shops.length > 0 ? 100 : 0;
    let score = 0;
    if (mainWarehouses.length > 0) score += 50;
    if (shops.length > 0) score += 50;
    return score;
  }, [isWarehouseMode, isShopMode, mainWarehouses.length, shops.length]);

  const chartByCity = useMemo(() => {
    const max = Math.max(1, ...cityCounts.map((r) => r.count));
    return cityCounts.map((r) => ({
      ...r,
      heightPct: Math.round((r.count / max) * 100),
    }));
  }, [cityCounts]);

  const existingMainInFormCity = useMemo(() => {
    const city = String(mainForm.city || '').trim();
    if (!city || city === 'Other') return null;
    const key = city.toLowerCase();
    return mainWarehouses.find((w) => String(w.city || '').trim().toLowerCase() === key) || null;
  }, [mainForm.city, mainWarehouses]);

  const submitMain = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!mainForm.name.trim()) {
      setError('Main warehouse name is required.');
      return;
    }
    if (existingMainInFormCity) {
      setError(
        `A main warehouse already exists for ${mainForm.city} (${existingMainInFormCity.name}). Open it from the list below instead of creating another.`,
      );
      return;
    }
    setSavingMain(true);
    try {
      const res = await createMainWarehouse(axiosPrivate, {
        name: mainForm.name.trim(),
        city: mainForm.city,
        address: mainForm.address.trim(),
        description: mainForm.description.trim(),
      });
      setMessage(res?.message || `Main warehouse added for ${mainForm.city}.`);
      setMainForm(EMPTY_MAIN);
      await reload();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not create main warehouse.');
    } finally {
      setSavingMain(false);
    }
  };

  const submitShop = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!shopForm.name.trim()) {
      setError('Shop name is required.');
      return;
    }
    setSavingShop(true);
    try {
      await createSubWarehouse(axiosPrivate, {
        name: shopForm.name.trim(),
        city: shopForm.city,
        address: shopForm.address.trim(),
        description: shopForm.description.trim(),
      });
      setMessage('Shop created. Assign salespeople in the Sales Team tab.');
      setShopForm(EMPTY_SHOP);
      await reload();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not create Shop.');
    } finally {
      setSavingShop(false);
    }
  };

  const openDeleteModal = (loc) => {
    if (!loc) return;
    setDeleteTarget(loc);
    setMessage('');
    setError('');
  };

  const renderLocationCard = (loc, isMain) => {
    const id = warehouseId(loc);
    const cityClass = cityVisualClass(loc.city);
    const typeClass = isMain ? 'wh-location-card__visual--main' : 'wh-location-card__visual--shop';

    return (
      <article key={id} className="wh-location-card wh-setup-card wh-location-card--with-menu">
        <div className={`wh-location-card__visual ${typeClass} ${cityClass}`.trim()}>
          <LocationCardMenu
            label={`Options for ${loc.name || 'location'}`}
            onEdit={() => setEditTarget(loc)}
            onDelete={() => openDeleteModal(loc)}
          />
          <span className="wh-location-card__pin" aria-hidden>
            {isMain ? '🏭' : '🏪'}
          </span>
          <span className="wh-location-card__city">{loc.city || 'Other'}</span>
        </div>
        <div className="wh-location-card__body">
          <span className={`wh-location-card__tag ${isMain ? '' : 'wh-location-card__tag--shop'}`}>
            {isMain ? 'Main Warehouse' : 'Retail Shop'}
          </span>
          <span className="wh-location-card__name">{loc.name}</span>
          <span className="wh-location-card__meta">
            {loc.address ? <span>{loc.address}</span> : null}
            {!isMain && shopParentLabel(loc) ? <span>Legacy: {shopParentLabel(loc)}</span> : null}
          </span>
          <div className="wh-setup-card__actions">
            <button
              type="button"
              className="wh-setup-btn wh-setup-btn--ghost"
              onClick={() => setViewingWarehouse(loc)}
            >
              View products
            </button>
          </div>
        </div>
      </article>
    );
  };

  return (
    <div className="wh-dash-wrap warehouses-panel">
      {viewingWarehouse ? (
        <WarehouseProductsModal warehouse={viewingWarehouse} onClose={() => setViewingWarehouse(null)} />
      ) : null}

      <DeleteWarehouseModal
        warehouse={deleteTarget}
        mainWarehouses={mainWarehouses}
        onClose={() => setDeleteTarget(null)}
        onDeleted={async (res) => {
          setMessage(res?.message || 'Location deleted.');
          await reload();
        }}
      />

      <EditLocationModal
        open={Boolean(editTarget)}
        location={editTarget}
        variant={isWarehouseMode ? 'warehouse' : 'shop'}
        mainWarehouses={mainWarehouses}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          setEditTarget(null);
          setMessage(isWarehouseMode ? 'Warehouse updated.' : 'Shop updated.');
          await reload();
        }}
      />

      <div className="wh-dash-toolbar">
        {typeof onBack === 'function' ? (
          <button type="button" className="wh-link wh-setup-back" onClick={onBack}>
            ← Back
          </button>
        ) : null}
        <input
          type="search"
          className="wh-search wh-search--wide"
          placeholder={isWarehouseMode ? 'Search Warehouses…' : 'Search Shops…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search locations"
          disabled={loading}
        />
        {loading ? <span className="wh-dash-refresh-hint">Loading…</span> : null}
      </div>

      {error ? (
        <div className="wh-panel wh-setup-alert wh-setup-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="wh-panel wh-setup-alert wh-setup-alert--ok" role="status">
          {message}
        </div>
      ) : null}

      <div className="wh-dash-layout">
        <div className="wh-dash__main">
          <section className="wh-hero wh-setup-hero">
            <div className="wh-hero__inner">
              <p className="wh-setup-hero__eyebrow">
                {isWarehouseMode ? 'Warehouse setup' : 'Shop setup'}
              </p>
              <h2>
                {isWarehouseMode
                  ? 'Configure regional main Warehouses'
                  : 'Configure Retail Shops'}
              </h2>
              <p>
                {isWarehouseMode
                  ? 'Regional main Warehouses receive bulk stock. Add one hub per city or region.'
                  : 'Retail Shops are independent — they can exist in towns without a Warehouse. Assign salespeople after creating each Shop.'}
              </p>
            </div>
          </section>

          <div className="wh-status-row">
            {isWarehouseMode ? (
              <>
                <article className="wh-status-card">
                  <span className="wh-status-card__icon wh-status-card__icon--request" aria-hidden>
                    🏭
                  </span>
                  <div className="wh-status-card__body">
                    <span className="wh-status-card__label">Main Warehouses</span>
                    <span className="wh-status-card__value">
                      {loading ? '—' : mainWarehouses.length}
                    </span>
                    <span className="wh-status-card__sub">One hub per city / region</span>
                  </div>
                </article>
                <article className="wh-status-card">
                  <span className="wh-status-card__icon wh-status-card__icon--stock" aria-hidden>
                    📍
                  </span>
                  <div className="wh-status-card__body">
                    <span className="wh-status-card__label">Towns covered</span>
                    <span className="wh-status-card__value">
                      {loading ? '—' : new Set(mainWarehouses.map((w) => w.city).filter(Boolean)).size}
                    </span>
                    <span className="wh-status-card__sub">Cities with a main Warehouse</span>
                  </div>
                </article>
              </>
            ) : (
              <>
                <article className="wh-status-card">
                  <span className="wh-status-card__icon wh-status-card__icon--travel" aria-hidden>
                    🏪
                  </span>
                  <div className="wh-status-card__body">
                    <span className="wh-status-card__label">Retail Shops</span>
                    <span className="wh-status-card__value">{loading ? '—' : shops.length}</span>
                    <span className="wh-status-card__sub">Independent retail points</span>
                  </div>
                </article>
                <article className="wh-status-card">
                  <span className="wh-status-card__icon wh-status-card__icon--stock" aria-hidden>
                    📍
                  </span>
                  <div className="wh-status-card__body">
                    <span className="wh-status-card__label">Towns covered</span>
                    <span className="wh-status-card__value">
                      {loading ? '—' : new Set(shops.map((w) => w.city).filter(Boolean)).size}
                    </span>
                    <span className="wh-status-card__sub">Cities with a Shop</span>
                  </div>
                </article>
              </>
            )}
          </div>

          {isWarehouseMode ? (
          <section className="wh-panel wh-setup-form-panel">
            <div className="wh-section-head">
              <h3>Add main warehouse</h3>
            </div>
            <p className="wh-setup-form-panel__hint">
              One main warehouse per city or region (except &ldquo;Other&rdquo;). The USA warehouse is
              used for bulk uploads and sending stock to Cameroon regions.
            </p>
            <form className="wh-setup-form" onSubmit={submitMain}>
              <label className="wh-setup-field">
                <span>Region / city</span>
                <select
                  value={mainForm.city}
                  onChange={(e) => setMainForm((f) => ({ ...f, city: e.target.value }))}
                >
                  {CITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {existingMainInFormCity ? (
                <p className="wh-setup-alert wh-setup-alert--error" role="alert">
                  {existingMainInFormCity.name} is already the main warehouse for {mainForm.city}.
                </p>
              ) : null}
              {isUsaCity(mainForm.city) && !existingMainInFormCity ? (
                <p className="wh-setup-form-panel__hint">
                  Only one USA main warehouse is allowed. If creation fails, redeploy the latest backend
                  or restore a previously deleted USA warehouse using the same form.
                </p>
              ) : null}
              <label className="wh-setup-field">
                <span>Name</span>
                <input
                  value={mainForm.name}
                  onChange={(e) => setMainForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Douala Central Hub"
                  required
                />
              </label>
              <label className="wh-setup-field">
                <span>Address (optional)</span>
                <input
                  value={mainForm.address}
                  onChange={(e) => setMainForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Street or district"
                />
              </label>
              <button type="submit" className="wh-hero__btn" disabled={savingMain}>
                {savingMain ? 'Creating…' : 'Add Warehouse →'}
              </button>
            </form>
          </section>
          ) : null}

          {isWarehouseMode ? (
          <section className="wh-location-rows">
            <div className="wh-section-head">
              <h3>Regional main warehouses</h3>
              <span className="wh-location-row__count">
                {mainsFiltered.length} warehouse{mainsFiltered.length === 1 ? '' : 's'}
              </span>
            </div>
            {loading ? (
              <div className="wh-locations-scroll" aria-hidden>
                {[1, 2].map((n) => (
                  <div key={n} className="wh-skeleton-card">
                    <div className="wh-skeleton wh-skeleton-card__top" />
                    <div className="wh-skeleton-card__body">
                      <span className="wh-skeleton wh-skeleton-card__line wh-skeleton-card__line--title" />
                      <span className="wh-skeleton wh-skeleton-card__line" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mainsFiltered.length === 0 ? (
              <p className="wh-empty">
                {search ? 'No main warehouses match your search.' : 'No main warehouses yet.'}
              </p>
            ) : (
              <div className="wh-locations-scroll">
                {mainsFiltered.map((main) => renderLocationCard(main, true))}
              </div>
            )}
          </section>
          ) : null}

          {isShopMode ? (
          <section className="wh-panel wh-setup-form-panel">
            <div className="wh-section-head">
              <h3>Add Retail Shop</h3>
            </div>
            <p className="wh-setup-form-panel__hint">
              Shops are not tied to a Warehouse. Use any town where you sell.
            </p>
            <form className="wh-setup-form" onSubmit={submitShop}>
              <label className="wh-setup-field">
                <span>Shop name</span>
                <input
                  value={shopForm.name}
                  onChange={(e) => setShopForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Akwa retail point"
                  required
                />
              </label>
              <label className="wh-setup-field">
                <span>Town / city</span>
                <select
                  value={shopForm.city}
                  onChange={(e) => setShopForm((f) => ({ ...f, city: e.target.value }))}
                >
                  {CITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wh-setup-field">
                <span>Address (optional)</span>
                <input
                  value={shopForm.address}
                  onChange={(e) => setShopForm((f) => ({ ...f, address: e.target.value }))}
                />
              </label>
              <button type="submit" className="wh-hero__btn" disabled={savingShop}>
                {savingShop ? 'Adding…' : 'Add Shop →'}
              </button>
            </form>
          </section>
          ) : null}

          {isShopMode ? (
          <section className="wh-location-rows">
            <div className="wh-section-head">
              <h3>Retail Shops</h3>
              <span className="wh-location-row__count">
                {shopsFiltered.length} Shop{shopsFiltered.length === 1 ? '' : 's'}
              </span>
            </div>
            {loading ? (
              <div className="wh-locations-scroll" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="wh-skeleton-card">
                    <div className="wh-skeleton wh-skeleton-card__top" />
                    <div className="wh-skeleton-card__body">
                      <span className="wh-skeleton wh-skeleton-card__line wh-skeleton-card__line--title" />
                      <span className="wh-skeleton wh-skeleton-card__line" />
                    </div>
                  </div>
                ))}
              </div>
            ) : shopsFiltered.length === 0 ? (
              <p className="wh-empty">
                {search
                  ? 'No Shops match your search.'
                  : 'No Shops yet. Add your first Retail Shop above.'}
              </p>
            ) : (
              <div className="wh-locations-scroll">
                {shopsFiltered.map((shop) => renderLocationCard(shop, false))}
              </div>
            )}
          </section>
          ) : null}
        </div>

        <aside className="wh-dash__aside">
          <section className="wh-panel wh-stat-ring">
            {loading ? (
              <div className="wh-skeleton wh-skeleton--ring" aria-hidden />
            ) : (
              <SetupStatRing pct={setupPct} />
            )}
            <h4>Setup progress</h4>
            <p>
              {loading
                ? 'Loading your locations…'
                : isWarehouseMode
                  ? setupPct === 100
                    ? 'You have at least one main Warehouse configured.'
                    : 'Add a main Warehouse to receive bulk stock.'
                  : setupPct === 100
                    ? 'You have at least one Retail Shop configured.'
                    : 'Add your first Retail Shop to start selling.'}
            </p>
          </section>

          <section className="wh-panel">
            <div className="wh-section-head">
              <h3>Locations by town</h3>
            </div>
            {loading ? (
              <div className="wh-chart" aria-hidden>
                {[1, 2, 3].map((n) => (
                  <div key={n} className="wh-chart__item">
                    <div className="wh-skeleton wh-skeleton--bar" />
                  </div>
                ))}
              </div>
            ) : chartByCity.length === 0 ? (
              <p className="wh-empty">Add a location to see town breakdown.</p>
            ) : (
              <div className="wh-chart" role="img" aria-label="Locations per town">
                {chartByCity.map((row) => (
                  <div key={row.city} className="wh-chart__item">
                    <div
                      className="wh-chart__bar"
                      style={{ height: `${Math.max(12, row.heightPct)}%` }}
                      title={`${row.count} location${row.count === 1 ? '' : 's'}`}
                    />
                    <span className="wh-chart__label">{row.city}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="wh-panel wh-setup-checklist">
            <div className="wh-section-head">
              <h3>Next steps</h3>
            </div>
            <ul className="wh-setup-checklist__list">
              {isWarehouseMode ? (
                <>
                  <li className={mainWarehouses.length > 0 ? 'is-done' : ''}>
                    <span className="wh-setup-checklist__icon" aria-hidden>
                      {mainWarehouses.length > 0 ? '✓' : '1'}
                    </span>
                    <div>
                      <strong>Add a main warehouse</strong>
                      <span>Receive bulk stock per region</span>
                    </div>
                  </li>
                  <li className={mainWarehouses.length > 0 ? 'is-done' : ''}>
                    <span className="wh-setup-checklist__icon" aria-hidden>
                      {mainWarehouses.length > 0 ? '✓' : '2'}
                    </span>
                    <div>
                      <strong>Receive bulk stock</strong>
                      <span>Use Inventory or Add Product after setup</span>
                    </div>
                  </li>
                </>
              ) : (
                <>
                  <li className={shops.length > 0 ? 'is-done' : ''}>
                    <span className="wh-setup-checklist__icon" aria-hidden>
                      {shops.length > 0 ? '✓' : '1'}
                    </span>
                    <div>
                      <strong>Create Retail Shops</strong>
                      <span>Sell in any town — no hub required</span>
                    </div>
                  </li>
                  <li className={shops.length > 0 ? 'is-done' : ''}>
                    <span className="wh-setup-checklist__icon" aria-hidden>
                      {shops.length > 0 ? '✓' : '2'}
                    </span>
                    <div>
                      <strong>Assign salespeople</strong>
                      <span>Open Sales team tab after Shops exist</span>
                    </div>
                  </li>
                </>
              )}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
