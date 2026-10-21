import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppModal } from '../AppDialog';
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

export default function EditLocationModal({
  open,
  location = null,
  variant = 'warehouse',
  mainWarehouses = [],
  onClose,
  onSaved,
}) {
  const isWarehouse = variant === 'warehouse';
  const axiosPrivate = useAxiosPrivate();
  const selectedId = location ? warehouseId(location) : '';

  const [form, setForm] = useState(EMPTY_FORM);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRecord = useCallback(async () => {
    if (!selectedId) return;
    setLoadingRecord(true);
    setError('');
    try {
      const data = await fetchWarehouses(axiosPrivate);
      const list = isWarehouse ? data.mainWarehouses : data.subWarehouses;
      const record = (Array.isArray(list) ? list : []).find((row) => warehouseId(row) === selectedId);
      if (!record) {
        setError(`${isWarehouse ? 'Warehouse' : 'Shop'} not found.`);
        setForm(EMPTY_FORM);
        return;
      }
      setForm({
        name: record.name || '',
        city: record.city || 'Douala',
        address: record.address || '',
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not load location.');
      setForm(EMPTY_FORM);
    } finally {
      setLoadingRecord(false);
    }
  }, [axiosPrivate, isWarehouse, selectedId]);

  useEffect(() => {
    if (!open || !selectedId) return;
    setMessage('');
    setError('');
    loadRecord().catch(() => {});
  }, [open, selectedId, loadRecord]);

  const existingMainInFormCity = useMemo(() => {
    if (!isWarehouse) return null;
    const city = String(form.city || '').trim();
    if (!city || city === 'Other') return null;
    const key = city.toLowerCase();
    return (
      (mainWarehouses || []).find(
        (row) =>
          warehouseId(row) !== selectedId &&
          String(row.city || '')
            .trim()
            .toLowerCase() === key,
      ) || null
    );
  }, [form.city, isWarehouse, mainWarehouses, selectedId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
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
      await onSaved?.(res);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (!open || !location) return null;

  const title = `Edit ${isWarehouse ? 'warehouse' : 'shop'}`;

  return (
    <AppModal
      open={open}
      title={title}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="app-dialog__btn app-dialog__btn--ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            form="edit-location-modal-form"
            className="app-dialog__btn app-dialog__btn--primary"
            disabled={saving || loadingRecord || Boolean(existingMainInFormCity)}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <p className="wh-setup-form-panel__hint">
        Update the name, city, or address for this {isWarehouse ? 'main warehouse' : 'retail shop'}. Inventory and
        sales history are not affected.
      </p>

      <form id="edit-location-modal-form" className="wh-setup-form wh-edit-location__form" onSubmit={handleSubmit}>
        <label className="wh-setup-field">
          <span>Region / city</span>
          <select
            value={form.city}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
            disabled={saving || loadingRecord}
          >
            {CITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
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
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder={isWarehouse ? 'e.g. Douala Central Hub' : 'e.g. Downtown Shop'}
            required
            disabled={saving || loadingRecord}
          />
        </label>

        <label className="wh-setup-field">
          <span>Address (optional)</span>
          <input
            value={form.address}
            onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
            placeholder="Street or district"
            disabled={saving || loadingRecord}
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
      </form>
    </AppModal>
  );
}
