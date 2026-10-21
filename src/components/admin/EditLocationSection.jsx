import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { fetchWarehouses, updateWarehouse, warehouseId } from '../../api/warehouseApi';
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

const EMPTY_FORM = { name: '', city: 'Douala', address: '' };

export default function EditLocationSection({
  variant = 'warehouse',
  locations = [],
  mainWarehouses = [],
  selectedId = '',
  onSelectId,
  onSaved,
}) {
  const isWarehouse = variant === 'warehouse';
  const axiosPrivate = useAxiosPrivate();
  const sectionRef = useRef(null);
  const [fullRecords, setFullRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const locationOptions = useMemo(() => {
    return (locations || [])
      .map((loc) => ({
        id: warehouseId(loc),
        name: loc.name || 'Location',
        city: loc.city || 'Other',
      }))
      .filter((loc) => loc.id);
  }, [locations]);

  const reloadFullRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const data = await fetchWarehouses(axiosPrivate);
      setFullRecords(isWarehouse ? data.mainWarehouses : data.subWarehouses);
    } catch {
      setFullRecords([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [axiosPrivate, isWarehouse]);

  useEffect(() => {
    reloadFullRecords().catch(() => {});
  }, [reloadFullRecords]);

  useEffect(() => {
    if (!locationOptions.length) {
      onSelectId?.('');
      return;
    }
    if (selectedId && locationOptions.some((loc) => loc.id === selectedId)) return;
    onSelectId?.(locationOptions[0].id);
  }, [locationOptions, selectedId, onSelectId]);

  useEffect(() => {
    if (!selectedId) {
      setForm(EMPTY_FORM);
      return;
    }
    const record = fullRecords.find((w) => warehouseId(w) === selectedId);
    if (!record) return;
    setForm({
      name: record.name || '',
      city: record.city || 'Douala',
      address: record.address || '',
    });
    setError('');
    setMessage('');
  }, [selectedId, fullRecords]);

  const existingMainInFormCity = useMemo(() => {
    if (!isWarehouse) return null;
    const city = String(form.city || '').trim();
    if (!city || city === 'Other') return null;
    const key = city.toLowerCase();
    return (
      (mainWarehouses || []).find(
        (w) =>
          warehouseId(w) !== selectedId &&
          String(w.city || '')
            .trim()
            .toLowerCase() === key,
      ) || null
    );
  }, [form.city, isWarehouse, mainWarehouses, selectedId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setError('');
    setMessage('');
    if (!form.name.trim()) {
      setError(`${isWarehouse ? 'Warehouse' : 'Shop'} name is required.`);
      return;
    }
    if (existingMainInFormCity) {
      setError(
        `${existingMainInFormCity.name} is already the main warehouse for ${form.city}. Choose a different city.`,
      );
      return;
    }
    setSaving(true);
    try {
      const res = await updateWarehouse(axiosPrivate, selectedId, {
        name: form.name.trim(),
        city: form.city,
        address: form.address.trim(),
      });
      setMessage(res?.message || `${isWarehouse ? 'Warehouse' : 'Shop'} updated.`);
      await reloadFullRecords();
      await onSaved?.(res);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!locationOptions.length) return null;

  return (
    <section className="wh-panel wh-edit-location" ref={sectionRef} id="edit-location-section">
      <div className="wh-section-head">
        <h3>Edit {isWarehouse ? 'warehouse' : 'shop'} information</h3>
      </div>
      <p className="wh-setup-form-panel__hint">
        Update the name, city, or address for a {isWarehouse ? 'main warehouse' : 'retail shop'}. Inventory
        and sales history are not affected.
      </p>

      <form className="wh-setup-form wh-edit-location__form" onSubmit={handleSubmit}>
        <label className="wh-setup-field">
          <span>Select {isWarehouse ? 'warehouse' : 'shop'}</span>
          <select
            value={selectedId}
            onChange={(e) => onSelectId?.(e.target.value)}
            disabled={saving || loadingRecords}
          >
            {locationOptions.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.city})
              </option>
            ))}
          </select>
        </label>

        <label className="wh-setup-field">
          <span>Region / city</span>
          <select
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            disabled={saving}
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
            {existingMainInFormCity.name} is already the main warehouse for {form.city}.
          </p>
        ) : null}

        <label className="wh-setup-field">
          <span>Name</span>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder={isWarehouse ? 'e.g. Douala Central Hub' : 'e.g. Downtown Shop'}
            required
            disabled={saving}
          />
        </label>

        <label className="wh-setup-field">
          <span>Address (optional)</span>
          <input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            placeholder="Street or district"
            disabled={saving}
          />
        </label>

        {error ? (
          <p className="wh-setup-alert wh-setup-alert--error" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="wh-setup-alert wh-setup-alert--ok" role="status">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          className="wh-hero__btn"
          disabled={saving || loadingRecords || Boolean(existingMainInFormCity)}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </section>
  );
}
