import { useEffect, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  addBusinessCity,
  deleteBusinessCity,
  emitBusinessCitiesUpdated,
  fetchBusinessCities,
  updateBusinessCity,
} from '../../api/businessCitiesApi';

export default function BusinessCitiesPanel({ sectionRef, addInputRef, onBackToActions }) {
  const client = useAxiosPrivate();
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cityName, setCityName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingCity, setEditingCity] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCity, setDeletingCity] = useState('');

  const loadCities = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchBusinessCities(client);
      setCities(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setCities([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load business cities.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCities().catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = String(cityName || '').trim();
    if (name.length < 2) {
      setError('City name must be at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const rows = await addBusinessCity(client, name);
      setCities(Array.isArray(rows) ? rows : []);
      setCityName('');
      setSuccess(`${name} added successfully.`);
      emitBusinessCitiesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not add business city.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (city) => {
    setEditingCity(city);
    setEditingName(city);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingCity(null);
    setEditingName('');
  };

  const handleSaveEdit = async () => {
    const currentName = String(editingCity || '').trim();
    const nextName = String(editingName || '').trim();
    if (!currentName) return;
    if (nextName.length < 2) {
      setError('City name must be at least 2 characters.');
      return;
    }
    if (nextName === currentName) {
      cancelEdit();
      return;
    }

    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      const rows = await updateBusinessCity(client, currentName, nextName);
      setCities(Array.isArray(rows) ? rows : []);
      setEditingCity(null);
      setEditingName('');
      setSuccess(`${nextName} updated successfully.`);
      emitBusinessCitiesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not update business city.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (city) => {
    const name = String(city || '').trim();
    if (!name) return;

    const ok = window.confirm(
      `Delete ${name}?\n\nThis removes it from location dropdowns. Cities still used by accounts cannot be deleted.`,
    );
    if (!ok) return;

    setDeletingCity(name);
    setError('');
    setSuccess('');
    try {
      const rows = await deleteBusinessCity(client, name);
      setCities(Array.isArray(rows) ? rows : []);
      if (editingCity === name) {
        setEditingCity(null);
        setEditingName('');
      }
      setSuccess(`${name} deleted successfully.`);
      emitBusinessCitiesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete business city.');
    } finally {
      setDeletingCity('');
    }
  };

  return (
    <section ref={sectionRef} className="wh-panel wh-settings-section" id="settings-business-cities">
        <div className="wh-section-head">
          <div className="wh-settings-section__head-main">
            {typeof onBackToActions === 'function' ? (
              <button type="button" className="wh-settings-section__back" onClick={onBackToActions}>
                ← Back to actions
              </button>
            ) : null}
            <h3>Business Cities</h3>
          </div>
          <span className="wh-location-row__count">{cities.length} cities</span>
        </div>
        <p className="wh-setup-form-panel__hint">
          Add business cities used by account forms and location dropdowns across the platform.
        </p>

        <form className="wh-setup-form" onSubmit={handleSubmit}>
          <label className="wh-setup-field">
            <span>New city name</span>
            <input
              ref={addInputRef}
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              placeholder="e.g. Kribi"
              maxLength={80}
              required
            />
          </label>
          <button type="submit" className="wh-hero__btn" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add business city'}
          </button>
        </form>

        {error ? (
          <p className="wh-setup-alert wh-setup-alert--error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="wh-setup-alert wh-setup-alert--ok" role="status">
            {success}
          </p>
        ) : null}

        {loading ? (
          <p className="wh-empty">Loading cities…</p>
        ) : (
          <div className="accounts-table-wrap-lite wh-setup-table">
            <table className="accounts-table-lite">
              <thead>
                <tr>
                  <th align="left">City</th>
                  <th align="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cities.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="accounts-table-empty">
                      No business cities available.
                    </td>
                  </tr>
                ) : (
                  cities.map((city) => {
                    const isEditing = editingCity === city;
                    const isDeleting = deletingCity === city;
                    return (
                      <tr key={city}>
                        <td>
                          {isEditing ? (
                            <input
                              className="business-city-edit-input"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              maxLength={80}
                              autoFocus
                              disabled={savingEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void handleSaveEdit();
                                }
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelEdit();
                                }
                              }}
                            />
                          ) : (
                            city
                          )}
                        </td>
                        <td align="right">
                          <div className="wh-setup-table__actions wh-setup-table__actions--wide">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  className="wh-setup-btn wh-setup-btn--ghost wh-setup-btn--compact"
                                  disabled={savingEdit}
                                  onClick={() => void handleSaveEdit()}
                                >
                                  {savingEdit ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  className="wh-setup-btn wh-setup-btn--ghost wh-setup-btn--compact"
                                  disabled={savingEdit}
                                  onClick={cancelEdit}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="wh-setup-btn wh-setup-btn--ghost wh-setup-btn--compact"
                                  disabled={Boolean(deletingCity)}
                                  onClick={() => startEdit(city)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="wh-setup-btn wh-setup-btn--danger wh-setup-btn--compact"
                                  disabled={Boolean(deletingCity) || Boolean(editingCity)}
                                  onClick={() => void handleDelete(city)}
                                >
                                  {isDeleting ? 'Deleting…' : 'Delete'}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
  );
}
