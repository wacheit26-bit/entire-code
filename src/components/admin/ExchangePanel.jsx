import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  checkExchangeIme,
  EXCHANGE_CONDITION_OPTIONS,
  fetchAvailableReplacements,
  fetchExchangeSalesByMonth,
  fetchExchangeSalesByPhoneName,
  processExchange,
} from '../../api/exchangeApi';
import { formatMonthLabel, toMonthKey } from '../../utils/orderMonthUtils';
import { formatMoneyXaf } from '../../utils/formatMoneyXaf';
import { AppModal } from '../AppDialog';
import MoneyXaf from '../MoneyXaf';
import './ExchangePanel.css';

function currentMonthKey() {
  return toMonthKey(new Date().toISOString()) || '';
}

function buildMonthOptions(count = 18) {
  const options = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = toMonthKey(d.toISOString());
    if (key) options.push({ value: key, label: formatMonthLabel(key) });
  }
  return options;
}

function parseMoneyInput(raw) {
  const n = Number(String(raw || '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

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

function SalesTable({ rows, loading, onSelectRow, selectedIme }) {
  if (loading) {
    return <p className="exchange-panel__empty">Loading sales…</p>;
  }
  if (!rows.length) {
    return <p className="exchange-panel__empty">No sold phones match these filters.</p>;
  }
  return (
    <div className="exchange-panel__table-wrap">
      <table className="exchange-panel__table">
        <thead>
          <tr>
            <th aria-label="Select" />
            <th>Sold date</th>
            <th>Sold by</th>
            <th>Phone name</th>
            <th>Storage</th>
            <th>IMEI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowIme = String(row.ime || '').trim();
            const isSelected = selectedIme && rowIme && selectedIme.toLowerCase() === rowIme.toLowerCase();
            return (
              <tr key={row.id || row.ime} className={isSelected ? 'is-selected' : ''}>
                <td>
                  <button
                    type="button"
                    className="exchange-panel__select-btn"
                    disabled={!rowIme}
                    onClick={() => onSelectRow?.(row)}
                    title={rowIme ? `Select ${rowIme} for exchange` : 'No IME on this record'}
                  >
                    Select
                  </button>
                </td>
                <td>{formatSoldDate(row.soldDate)}</td>
                <td>{row.soldBy?.name || '—'}</td>
                <td>{row.phoneName || '—'}</td>
                <td>{row.storage || '—'}</td>
                <td>{row.ime || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ExchangePanel() {
  const client = useAxiosPrivate();
  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const [month, setMonth] = useState(currentMonthKey);
  const [phoneName, setPhoneName] = useState('');
  const [debouncedPhoneName, setDebouncedPhoneName] = useState('');
  const [soldImeQuery, setSoldImeQuery] = useState('');
  const [debouncedSoldIme, setDebouncedSoldIme] = useState('');
  const [replacementImeFilter, setReplacementImeFilter] = useState('');
  const [debouncedReplacementIme, setDebouncedReplacementIme] = useState('');

  const [activeOriginalIme, setActiveOriginalIme] = useState('');
  const [soldUnitInfo, setSoldUnitInfo] = useState(null);
  const [replacementRows, setReplacementRows] = useState([]);
  const [selectedReplacementIme, setSelectedReplacementIme] = useState('');

  const [salesRows, setSalesRows] = useState([]);
  const [phoneNameOptions, setPhoneNameOptions] = useState([]);
  const [inventoryPhoneNameOptions, setInventoryPhoneNameOptions] = useState([]);

  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingSoldUnit, setLoadingSoldUnit] = useState(false);
  const [loadingReplacements, setLoadingReplacements] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusChoice, setStatusChoice] = useState(EXCHANGE_CONDITION_OPTIONS[0]);
  const [amountCollected, setAmountCollected] = useState('');
  const [amountRefunded, setAmountRefunded] = useState('');
  const [confirmPaymentError, setConfirmPaymentError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [exchangeSummary, setExchangeSummary] = useState(null);

  const inReplacementMode = Boolean(activeOriginalIme && soldUnitInfo);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSoldIme(soldImeQuery.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [soldImeQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPhoneName(phoneName.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [phoneName]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedReplacementIme(replacementImeFilter.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [replacementImeFilter]);

  const loadMonthSales = useCallback(async () => {
    setLoadingSales(true);
    setError('');
    try {
      const body = await fetchExchangeSalesByMonth(client, { month });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      setSalesRows(rows);
      const names = [...new Set(rows.map((r) => String(r.phoneName || '').trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      );
      setPhoneNameOptions(names);
    } catch (err) {
      setSalesRows([]);
      setPhoneNameOptions([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load monthly sales.');
    } finally {
      setLoadingSales(false);
    }
  }, [client, month]);

  const loadPhoneNameSales = useCallback(async () => {
    setLoadingSales(true);
    setError('');
    try {
      const body = await fetchExchangeSalesByPhoneName(client, {
        phoneName: debouncedPhoneName,
        month: month || undefined,
      });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      setSalesRows(rows);
      setPhoneNameOptions((prev) => {
        const merged = new Set([
          ...prev,
          debouncedPhoneName,
          ...rows.map((r) => String(r.phoneName || '').trim()).filter(Boolean),
        ]);
        return [...merged].sort((a, b) => a.localeCompare(b));
      });
    } catch (err) {
      setSalesRows([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load sales for this phone.');
    } finally {
      setLoadingSales(false);
    }
  }, [client, month, debouncedPhoneName]);

  const beginExchangeForSoldIme = useCallback(
    async (ime, { resetReplacementFilters = true } = {}) => {
      const normalized = String(ime || '').trim();
      if (normalized.length < 3) return;

      setLoadingSoldUnit(true);
      setError('');
      setSuccess('');
      setExchangeSummary(null);
      setActiveOriginalIme(normalized);
      setSelectedReplacementIme('');

      if (resetReplacementFilters) {
        setPhoneName('');
        setDebouncedPhoneName('');
        setReplacementImeFilter('');
        setDebouncedReplacementIme('');
      }

      try {
        const data = await checkExchangeIme(client, normalized);
        setSoldUnitInfo(data);
      } catch (err) {
        setActiveOriginalIme('');
        setSoldUnitInfo(null);
        setReplacementRows([]);
        if (err?.response?.status === 404) {
          setError(err?.response?.data?.message || 'This IME was not found as a sold unit.');
        } else {
          setError(err?.response?.data?.message || err?.message || 'Could not check this IME.');
        }
      } finally {
        setLoadingSoldUnit(false);
      }
    },
    [client],
  );

  const loadAvailableReplacements = useCallback(async () => {
    if (!activeOriginalIme || !soldUnitInfo) return;
    setLoadingReplacements(true);
    setError('');
    try {
      const body = await fetchAvailableReplacements(client, {
        excludeIme: activeOriginalIme,
        phoneName: debouncedPhoneName.length >= 2 ? debouncedPhoneName : undefined,
        replacementIme: debouncedReplacementIme.length >= 2 ? debouncedReplacementIme : undefined,
      });
      const rows = Array.isArray(body.rows) ? body.rows : [];
      setReplacementRows(rows);
      setInventoryPhoneNameOptions((prev) => {
        const merged = new Set([
          ...prev,
          ...rows.map((r) => String(r.phoneName || '').trim()).filter(Boolean),
        ]);
        return [...merged].sort((a, b) => a.localeCompare(b));
      });
      setSelectedReplacementIme((current) =>
        current && rows.some((row) => String(row.ime || '').trim() === current) ? current : '',
      );
    } catch (err) {
      setReplacementRows([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load available replacement phones.');
    } finally {
      setLoadingReplacements(false);
    }
  }, [client, activeOriginalIme, soldUnitInfo, debouncedPhoneName, debouncedReplacementIme]);

  useEffect(() => {
    if (inReplacementMode) return;
    if (debouncedSoldIme.length >= 3) return;
    if (debouncedPhoneName.length >= 2) {
      loadPhoneNameSales();
      return;
    }
    loadMonthSales();
  }, [inReplacementMode, debouncedSoldIme, debouncedPhoneName, loadMonthSales, loadPhoneNameSales]);

  useEffect(() => {
    if (inReplacementMode) return;
    if (debouncedSoldIme.length >= 3) {
      if (
        activeOriginalIme.toLowerCase() === debouncedSoldIme.toLowerCase() &&
        soldUnitInfo
      ) {
        return;
      }
      beginExchangeForSoldIme(debouncedSoldIme);
    }
  }, [inReplacementMode, debouncedSoldIme, activeOriginalIme, soldUnitInfo, beginExchangeForSoldIme]);

  useEffect(() => {
    if (!inReplacementMode) return;
    loadAvailableReplacements();
  }, [inReplacementMode, loadAvailableReplacements]);

  const selectedReplacement = useMemo(
    () =>
      replacementRows.find((row) => String(row.ime || '').trim() === selectedReplacementIme) || null,
    [replacementRows, selectedReplacementIme],
  );

  const previewPriceDifference = useMemo(() => {
    if (!soldUnitInfo || !selectedReplacement) return null;
    const original = Number(soldUnitInfo.originalUnitPrice);
    const replacement = Number(selectedReplacement.price);
    if (!Number.isFinite(original) || !Number.isFinite(replacement)) return null;
    return replacement - original;
  }, [soldUnitInfo, selectedReplacement]);

  const isUpgrade = previewPriceDifference != null && previewPriceDifference > 0;
  const isDowngrade = previewPriceDifference != null && previewPriceDifference < 0;
  const parsedAmountCollected = parseMoneyInput(amountCollected);
  const minimumCollected = isUpgrade ? previewPriceDifference : null;

  const canConfirmExchange = useMemo(() => {
    if (submitting) return false;
    if (!isUpgrade) return true;
    return parsedAmountCollected != null && parsedAmountCollected >= previewPriceDifference;
  }, [submitting, isUpgrade, parsedAmountCollected, previewPriceDifference]);

  const handleSelectSoldRow = (row) => {
    const ime = String(row?.ime || '').trim();
    if (!ime) return;
    setSoldImeQuery('');
    setDebouncedSoldIme('');
    beginExchangeForSoldIme(ime);
  };

  const handleBackToSoldList = () => {
    setActiveOriginalIme('');
    setSoldUnitInfo(null);
    setReplacementRows([]);
    setSelectedReplacementIme('');
    setSoldImeQuery('');
    setDebouncedSoldIme('');
    setPhoneName('');
    setDebouncedPhoneName('');
    setReplacementImeFilter('');
    setDebouncedReplacementIme('');
    setError('');
  };

  const handleProceed = () => {
    if (!soldUnitInfo?.ime || !selectedReplacementIme) return;
    setStatusChoice(EXCHANGE_CONDITION_OPTIONS[0]);
    setAmountCollected('');
    setAmountRefunded('');
    setConfirmPaymentError('');
    setConfirmOpen(true);
  };

  const handleClearReplacementSelection = () => {
    setSelectedReplacementIme('');
  };

  const handleConfirmExchange = async () => {
    if (!soldUnitInfo?.ime || !selectedReplacementIme || submitting) return;

    if (isUpgrade) {
      if (parsedAmountCollected == null || parsedAmountCollected < previewPriceDifference) {
        setConfirmPaymentError(
          `Amount collected must be at least ${formatMoneyXaf(previewPriceDifference)}.`,
        );
        return;
      }
    }

    setConfirmPaymentError('');
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        originalIME: soldUnitInfo.ime,
        newIME: selectedReplacementIme,
        status: statusChoice,
      };
      if (isUpgrade) {
        payload.amountCollected = parsedAmountCollected;
      } else if (isDowngrade && amountRefunded.trim() !== '') {
        payload.amountRefunded = parseMoneyInput(amountRefunded);
      }

      const data = await processExchange(client, payload);
      setConfirmOpen(false);
      setExchangeSummary(data);
      setSuccess('Exchange completed successfully.');
      handleBackToSoldList();
      if (debouncedPhoneName) await loadPhoneNameSales();
      else await loadMonthSales();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Exchange could not be completed.');
    } finally {
      setSubmitting(false);
    }
  };

  const nameDatalistOptions = inReplacementMode ? inventoryPhoneNameOptions : phoneNameOptions;

  return (
    <section className="exchange-panel">
      <div className={`exchange-panel__filters ${inReplacementMode ? 'exchange-panel__filters--replacement' : ''}`}>
        {!inReplacementMode ? (
          <div className="exchange-panel__field">
            <label htmlFor="exchange-month">Month</label>
            <select
              id="exchange-month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setSuccess('');
                setExchangeSummary(null);
              }}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="exchange-panel__field-hint">Filter sold phones by month.</p>
          </div>
        ) : null}

        <div className="exchange-panel__field">
          <label htmlFor="exchange-phone-name">
            {inReplacementMode ? 'Replacement phone name' : 'Phone name'}
          </label>
          <input
            id="exchange-phone-name"
            type="text"
            list="exchange-phone-name-options"
            value={phoneName}
            placeholder={inReplacementMode ? 'Filter unsold inventory by name' : 'Filter sold phones by name'}
            onChange={(e) => {
              setPhoneName(e.target.value);
              setSuccess('');
              setExchangeSummary(null);
            }}
          />
          <datalist id="exchange-phone-name-options">
            {nameDatalistOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <p className="exchange-panel__field-hint">
            {inReplacementMode
              ? 'Shows phones in inventory that are not sold yet.'
              : 'Filter sold phones — pick a row below to start an exchange.'}
          </p>
        </div>

        <div className="exchange-panel__field">
          <label htmlFor="exchange-ime">
            {inReplacementMode ? 'Replacement IMEI' : 'Sold IMEI'}
          </label>
          <input
            id="exchange-ime"
            type="text"
            value={inReplacementMode ? replacementImeFilter : soldImeQuery}
            placeholder={
              inReplacementMode ? 'Filter unsold inventory by IME' : 'Enter sold IME to exchange'
            }
            onChange={(e) => {
              if (inReplacementMode) {
                setReplacementImeFilter(e.target.value);
              } else {
                setSoldImeQuery(e.target.value);
              }
              setSuccess('');
              setExchangeSummary(null);
            }}
          />
          <p className="exchange-panel__field-hint">
            {inReplacementMode
              ? 'Narrows the replacement list to matching unsold IMEs.'
              : 'Look up a sold unit by IME, or select one from the table below.'}
          </p>
        </div>
      </div>

      {error ? <div className="exchange-panel__error">{error}</div> : null}
      {success ? <div className="exchange-panel__success">{success}</div> : null}

      {exchangeSummary ? (
        <div className="exchange-panel__ime-summary" aria-live="polite">
          <div>
            <dt>Original IME</dt>
            <dd>{exchangeSummary.originalIME}</dd>
          </div>
          <div>
            <dt>Replacement IME</dt>
            <dd>{exchangeSummary.newIME}</dd>
          </div>
          <div>
            <dt>Original status</dt>
            <dd>{exchangeSummary.conditionStatus}</dd>
          </div>
          <div>
            <dt>Replacement phone</dt>
            <dd>{exchangeSummary.replacementPhoneName || '—'}</dd>
          </div>
          {exchangeSummary.priceDifference != null ? (
            <div>
              <dt>Price difference</dt>
              <dd>
                <MoneyXaf value={exchangeSummary.priceDifference} />
              </dd>
            </div>
          ) : null}
          {exchangeSummary.amountCollected != null ? (
            <div>
              <dt>Amount collected</dt>
              <dd>
                <MoneyXaf value={exchangeSummary.amountCollected} />
              </dd>
            </div>
          ) : null}
          {exchangeSummary.amountRefunded != null ? (
            <div>
              <dt>Amount refunded</dt>
              <dd>
                <MoneyXaf value={exchangeSummary.amountRefunded} />
              </dd>
            </div>
          ) : null}
          {exchangeSummary.discountOwed != null && exchangeSummary.amountRefunded == null ? (
            <div>
              <dt>Discount owed</dt>
              <dd>
                <MoneyXaf value={exchangeSummary.discountOwed} />
              </dd>
            </div>
          ) : null}
        </div>
      ) : null}

      {inReplacementMode ? (
        <>
          <div className="exchange-panel__replacement-head">
            <h3>Select replacement phone</h3>
            <button type="button" className="exchange-panel__back-btn" onClick={handleBackToSoldList}>
              ← Back to sold list
            </button>
          </div>

          <dl className="exchange-panel__ime-summary">
            <div>
              <dt>Sold phone</dt>
              <dd>{soldUnitInfo.phoneName || '—'}</dd>
            </div>
            <div>
              <dt>Days since sold</dt>
              <dd>{soldUnitInfo.daysSinceSold ?? '—'}</dd>
            </div>
            <div>
              <dt>Sold by</dt>
              <dd>{soldUnitInfo.soldBy?.name || '—'}</dd>
            </div>
            <div>
              <dt>Original IME</dt>
              <dd>{soldUnitInfo.ime}</dd>
            </div>
          </dl>

          {loadingSoldUnit || loadingReplacements ? (
            <p className="exchange-panel__empty">Loading available replacement phones…</p>
          ) : null}

          {!loadingSoldUnit && !loadingReplacements && replacementRows.length ? (
            <>
              {selectedReplacement && selectedReplacementIme ? (
                <div className="exchange-panel__replacement-selected">
                  <h4>Replacement selected</h4>
                  <dl className="exchange-panel__ime-summary">
                    <div>
                      <dt>Phone name</dt>
                      <dd>{selectedReplacement.phoneName || '—'}</dd>
                    </div>
                    <div>
                      <dt>IMEI</dt>
                      <dd>{selectedReplacement.ime}</dd>
                    </div>
                    <div>
                      <dt>Storage</dt>
                      <dd>{selectedReplacement.storage || '—'}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>
                        {selectedReplacement.price != null ? (
                          <MoneyXaf value={selectedReplacement.price} />
                        ) : (
                          '—'
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{selectedReplacement.warehouse?.name || '—'}</dd>
                    </div>
                  </dl>
                  <div className="exchange-panel__actions exchange-panel__actions--split">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={handleClearReplacementSelection}
                    >
                      Choose a different phone
                    </button>
                    <button type="button" className="btn-primary" onClick={handleProceed}>
                      Proceed with exchange
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="exchange-panel__field-hint">
                    Showing {replacementRows.length} unsold phone(s) in inventory
                    {debouncedPhoneName ? ` matching “${debouncedPhoneName}”` : ''}
                    {debouncedReplacementIme ? ` with IME containing “${debouncedReplacementIme}”` : ''}.
                  </p>
                  <div className="exchange-panel__table-wrap">
                    <table className="exchange-panel__table">
                      <thead>
                        <tr>
                          <th aria-label="Select" />
                          <th>Phone name</th>
                          <th>IMEI</th>
                          <th>Storage</th>
                          <th>Price</th>
                          <th>Location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replacementRows.map((row) => (
                          <tr key={row.ime}>
                            <td>
                              <input
                                type="radio"
                                name="exchange-replacement"
                                checked={selectedReplacementIme === row.ime}
                                onChange={() => setSelectedReplacementIme(row.ime)}
                                aria-label={`Select ${row.phoneName || 'phone'} ${row.ime}`}
                              />
                            </td>
                            <td>{row.phoneName || '—'}</td>
                            <td>{row.ime}</td>
                            <td>{row.storage || '—'}</td>
                            <td>{row.price != null ? <MoneyXaf value={row.price} /> : '—'}</td>
                            <td>{row.warehouse?.name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}

          {!loadingSoldUnit && !loadingReplacements && !replacementRows.length ? (
            <p className="exchange-panel__empty">
              No unsold phones in inventory match these filters. Try clearing the phone name or IME filter.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {loadingSoldUnit ? <p className="exchange-panel__empty">Checking sold IME…</p> : null}
          {!debouncedPhoneName && !loadingSales ? (
            <p className="exchange-panel__field-hint">
              Showing sales for {formatMonthLabel(month)}. Enter a phone name to filter, or select a sold unit below.
            </p>
          ) : null}
          <SalesTable
            rows={salesRows}
            loading={loadingSales}
            selectedIme={activeOriginalIme}
            onSelectRow={handleSelectSoldRow}
          />
        </>
      )}

      <AppModal
        open={confirmOpen}
        title="Confirm exchange"
        onClose={() => !submitting && setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" disabled={submitting} onClick={() => setConfirmOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={submitting || !canConfirmExchange}
              onClick={handleConfirmExchange}
            >
              {submitting ? 'Processing…' : 'Confirm exchange'}
            </button>
          </>
        }
      >
        <p>
          Original IME <strong>{soldUnitInfo?.ime}</strong> ({soldUnitInfo?.phoneName || 'sold phone'}) will return to
          inventory as <strong>{statusChoice}</strong>. Replacement{' '}
          <strong>{selectedReplacement?.phoneName || 'phone'}</strong> — IME{' '}
          <strong>{selectedReplacementIme}</strong> — will be marked sold.
        </p>
        <div className="exchange-panel__field" style={{ marginTop: '1rem' }}>
          <label htmlFor="exchange-status">Status for original IME</label>
          <select
            id="exchange-status"
            value={statusChoice}
            onChange={(e) => setStatusChoice(e.target.value)}
          >
            {EXCHANGE_CONDITION_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {isUpgrade ? (
          <>
            <div className="exchange-panel__price-banner exchange-panel__price-banner--required">
              Additional amount required: <MoneyXaf value={previewPriceDifference} />
            </div>
            <div className="exchange-panel__field" style={{ marginTop: '1rem' }}>
              <label htmlFor="exchange-amount-collected">
                Amount collected <span className="exchange-panel__required">*</span>
              </label>
              <input
                id="exchange-amount-collected"
                type="number"
                min={minimumCollected || 0}
                step="1"
                value={amountCollected}
                placeholder={`Minimum ${formatMoneyXaf(minimumCollected || 0)}`}
                onChange={(e) => {
                  setAmountCollected(e.target.value);
                  setConfirmPaymentError('');
                }}
              />
              <p className="exchange-panel__field-hint">
                Minimum required: {formatMoneyXaf(minimumCollected || 0)}
              </p>
            </div>
            {confirmPaymentError ? (
              <div className="exchange-panel__field-error">{confirmPaymentError}</div>
            ) : null}
          </>
        ) : null}

        {isDowngrade ? (
          <>
            <div className="exchange-panel__price-banner exchange-panel__price-banner--refund">
              Customer is owed a discount of{' '}
              <MoneyXaf value={Math.abs(previewPriceDifference)} />
            </div>
            <div className="exchange-panel__field" style={{ marginTop: '1rem' }}>
              <label htmlFor="exchange-amount-refunded">Amount refunded (optional)</label>
              <input
                id="exchange-amount-refunded"
                type="number"
                min="0"
                step="1"
                value={amountRefunded}
                placeholder="Leave blank if not refunded yet"
                onChange={(e) => setAmountRefunded(e.target.value)}
              />
              <p className="exchange-panel__field-hint">
                Record the amount only if you actually gave the customer a refund or discount.
              </p>
            </div>
          </>
        ) : null}
      </AppModal>
    </section>
  );
}
