import { useEffect, useMemo, useState } from 'react';
import { updateSalesmanShops } from '../../api/adminApi';
import { warehouseId } from '../../api/warehouseApi';
import './SalespersonShopAssignments.css';

export default function SalespersonShopAssignments({
  client,
  salesperson,
  shops,
  onSaved,
  onCancel,
}) {
  const userId = String(salesperson?._id ?? salesperson?.id ?? '');
  const initialIds = useMemo(() => {
    const assigned = Array.isArray(salesperson?.assignedShops) ? salesperson.assignedShops : [];
    return assigned.map((s) => warehouseId(s)).filter(Boolean);
  }, [salesperson]);

  const [selected, setSelected] = useState(initialIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(initialIds);
  }, [initialIds, userId]);

  const toggle = (shopId) => {
    const key = String(shopId);
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
  };

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setError('');
    try {
      const data = await updateSalesmanShops(client, userId, selected);
      onSaved?.(data);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not update Shop assignments.');
    } finally {
      setSaving(false);
    }
  };

  if (!shops.length) {
    return (
      <div className="shop-assign">
        <p className="shop-assign__hint">Create Shops in Shop setup before assigning salespeople.</p>
        <button type="button" className="settings-btn" onClick={onCancel}>
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="shop-assign">
      <p className="shop-assign__hint">
        Select one or more Shops for <strong>{salesperson?.name || 'this salesperson'}</strong>. Their
        business city updates automatically from the first Shop in this list.
      </p>
      <ul className="shop-assign__list">
        {shops.map((shop) => {
          const id = warehouseId(shop);
          const checked = selected.includes(id);
          return (
            <li key={id}>
              <label>
                <input type="checkbox" checked={checked} onChange={() => toggle(id)} />
                <span>
                  {shop.name}
                  {shop.city ? ` · ${shop.city}` : ''}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <p className="shop-assign__error">{error}</p> : null}
      <div className="shop-assign__actions">
        <button type="button" className="settings-btn" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save assignments'}
        </button>
        <button type="button" className="settings-btn inventory-delete-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
