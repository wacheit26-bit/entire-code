import { useCallback, useEffect, useState } from 'react';
import { fetchSoldOutInventory, revokeSoldOutInventoryUnit } from '../../api/adminApi';
import MoneyXaf from '../MoneyXaf';
import useAutoHideScrollbar from '../../hooks/useAutoHideScrollbar';

function formatSoldDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function saleTypeLabel(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'wholesale') return 'Vendor';
  if (t === 'retail') return 'Retail';
  return t ? t : '—';
}

export default function InventorySoldOutPanel({ axiosPrivate, onTotalChange, onRevoked }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [revokingId, setRevokingId] = useState('');
  const [pendingRevokeRow, setPendingRevokeRow] = useState(null);
  const [search, setSearch] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const soldOutTableReady = !loading && rows.length > 0;
  const { ref: soldOutScrollRef, scrollVisible: soldOutScrollVisible } = useAutoHideScrollbar(
    4000,
    soldOutTableReady,
  );


  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = search.trim();
      const body = await fetchSoldOutInventory(axiosPrivate, {
        limit: 250,
        ...(q.length >= 2 ? { search: q } : {}),
      });
      setRows(body.rows);
      setTotal(body.total);
      onTotalChange?.(body.total);
    } catch (err) {
      setRows([]);
      setTotal(0);
      setError(err?.message || 'Could not load sold-out products.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, onTotalChange, search]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchDraft.trim());
  };

  const handleRevoke = async (row) => {
    const id = String(row?.id || '').trim();
    if (!id || revokingId) return;
    setPendingRevokeRow(row);
  };

  const confirmRevoke = async () => {
    const row = pendingRevokeRow;
    const id = String(row?.id || '').trim();
    if (!id || revokingId) return;
    setPendingRevokeRow(null);
    setRevokingId(id);
    setError('');
    setActionMsg('');
    try {
      await revokeSoldOutInventoryUnit(axiosPrivate, id);
      setActionMsg(`Sale revoked for IME ${row?.ime || 'unit'}.`);
      await reload();
      await onRevoked?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not revoke this sale.');
    } finally {
      setRevokingId('');
    }
  };

  return (
    <>
      <div className="wh-section-head">
        <h3>Sold out</h3>
        <span className="wh-location-row__count">
          {loading ? '…' : `${total.toLocaleString()} unit${total === 1 ? '' : 's'} sold`}
        </span>
      </div>

      <p className="wh-inventory-sold-out__lead">
        Units marked sold out from direct sales. Each row is one IME. Use search to filter by IME,
        product, customer, or shop.
      </p>

      <form className="wh-inventory-sold-out__search" onSubmit={handleSearchSubmit}>
        <input
          type="search"
          className="wh-search"
          placeholder="Search IME, product, customer, shop…"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
        />
        <button type="submit" className="wh-inventory-btn wh-inventory-btn--primary" disabled={loading}>
          Search
        </button>
        {search ? (
          <button
            type="button"
            className="wh-inventory-btn"
            disabled={loading}
            onClick={() => {
              setSearchDraft('');
              setSearch('');
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {error ? (
        <div className="wh-inventory-alert wh-inventory-alert--error" role="alert">
          {error}
        </div>
      ) : null}
      {actionMsg ? (
        <div className="wh-inventory-alert wh-inventory-alert--ok" role="status">
          {actionMsg}
        </div>
      ) : null}
      {pendingRevokeRow ? (
        <div className="wh-inventory-warning-modal" role="alertdialog" aria-modal="true">
          <div className="wh-inventory-warning-modal__card">
            <h4>Warning: Revoke this sale?</h4>
            <p>
              You are about to revoke IME <strong>{pendingRevokeRow.ime || '—'}</strong> for{' '}
              <strong>{pendingRevokeRow.productName || 'this product'}</strong>. Only this unit is
              restored; other phones from the same checkout stay sold.
            </p>
            <p>
              This will restore one unit back into shop inventory and reduce the salesperson
              commission for this sale.
            </p>
            <div className="wh-inventory-warning-modal__actions">
              <button
                type="button"
                className="wh-inventory-btn"
                onClick={() => setPendingRevokeRow(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wh-inventory-btn wh-inventory-btn--danger"
                onClick={() => confirmRevoke()}
              >
                Revoke anyway
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <p className="wh-empty">Loading sold-out units…</p> : null}

      {!loading && !error && rows.length === 0 ? (
        <p className="wh-empty">
          {search ? 'No sold-out units match your search.' : 'No sold-out units recorded yet.'}
        </p>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div
          ref={soldOutScrollRef}
          className={[
            'wh-inventory-table-wrap',
            'wh-inventory-sold-out-table-wrap',
            soldOutScrollVisible ? 'is-scroll-bar-visible' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <table className="wh-activity-table wh-inventory-table wh-inventory-sold-out-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>IME</th>
                <th>Capacity</th>
                <th>Color</th>
                <th>Sale type</th>
                <th className="fit-numeric-cell">Listed price</th>
                <th className="fit-numeric-cell">Sold price</th>
                <th>Shop</th>
                <th>Sold by</th>
                <th>Customer</th>
                <th>Sold at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.productName || 'Product'}</strong>
                    {row.brand ? (
                      <>
                        <br />
                        <span className="wh-status-card__sub">{row.brand}</span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <code className="wh-inventory-sold-out__ime">{row.ime || '—'}</code>
                  </td>
                  <td>{row.capacity || '—'}</td>
                  <td className="wh-inventory-cell--color">{row.color || '—'}</td>
                  <td>
                    <span className="wh-tag wh-inventory-sold-out__type">{saleTypeLabel(row.saleType)}</span>
                  </td>
                  <td className="fit-numeric-cell">
                    {Number(row.listedPrice) > 0 ? <MoneyXaf value={row.listedPrice} /> : '—'}
                  </td>
                  <td className="fit-numeric-cell">
                    {Number(row.unitPrice) > 0 ? <MoneyXaf value={row.unitPrice} /> : '—'}
                  </td>
                  <td>
                    {row.shop?.name || '—'}
                    {row.shop?.city ? (
                      <>
                        <br />
                        <span className="wh-status-card__sub">{row.shop.city}</span>
                      </>
                    ) : null}
                  </td>
                  <td>{row.soldBy?.name || '—'}</td>
                  <td>{row.customerName || '—'}</td>
                  <td>{formatSoldDate(row.soldAt)}</td>
                  <td>
                    <button
                      type="button"
                      className="wh-inventory-btn wh-inventory-btn--danger"
                      disabled={loading || revokingId === row.id}
                      onClick={() => handleRevoke(row)}
                    >
                      {revokingId === row.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > rows.length ? (
            <p className="wh-inventory-sold-out__more">
              Showing {rows.length} of {total.toLocaleString()} sold units. Refine search to find
              older records.
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
