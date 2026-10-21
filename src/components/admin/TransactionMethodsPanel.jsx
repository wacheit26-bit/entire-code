import { useEffect, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  addTransactionMethod,
  deleteTransactionMethod,
  emitTransactionMethodsUpdated,
  fetchTransactionMethods,
  updateTransactionMethod,
} from '../../api/transactionMethodsApi';

export default function TransactionMethodsPanel({ sectionRef, addInputRef, onBackToActions }) {
  const client = useAxiosPrivate();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [methodName, setMethodName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingValue, setDeletingValue] = useState('');

  const loadMethods = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchTransactionMethods(client);
      setMethods(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setMethods([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load transaction methods.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMethods().catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = String(methodName || '').trim();
    if (name.length < 2) {
      setError('Method name must be at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const rows = await addTransactionMethod(client, name);
      setMethods(Array.isArray(rows) ? rows : []);
      setMethodName('');
      setSuccess(`${name} added successfully.`);
      emitTransactionMethodsUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not add transaction method.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (method) => {
    setEditingValue(method.value);
    setEditingName(method.name);
    setError('');
    setSuccess('');
  };

  const cancelEdit = () => {
    if (savingEdit) return;
    setEditingValue('');
    setEditingName('');
  };

  const handleSaveEdit = async () => {
    const currentValue = String(editingValue || '').trim();
    const nextName = String(editingName || '').trim();
    if (!currentValue) return;
    if (nextName.length < 2) {
      setError('Method name must be at least 2 characters.');
      return;
    }

    const current = methods.find((m) => m.value === currentValue);
    if (current && nextName === current.name) {
      cancelEdit();
      return;
    }

    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      const rows = await updateTransactionMethod(client, currentValue, nextName);
      setMethods(Array.isArray(rows) ? rows : []);
      setEditingValue('');
      setEditingName('');
      setSuccess(`${nextName} updated successfully.`);
      emitTransactionMethodsUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not update transaction method.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (method) => {
    const name = String(method?.name || '').trim();
    const value = String(method?.value || '').trim();
    if (!value) return;

    const ok = window.confirm(
      `Delete ${name}?\n\nThis removes it from payment dropdowns. Methods still used on sales or receipts cannot be deleted.`,
    );
    if (!ok) return;

    setDeletingValue(value);
    setError('');
    setSuccess('');
    try {
      const rows = await deleteTransactionMethod(client, value);
      setMethods(Array.isArray(rows) ? rows : []);
      if (editingValue === value) {
        setEditingValue('');
        setEditingName('');
      }
      setSuccess(`${name} deleted successfully.`);
      emitTransactionMethodsUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete transaction method.');
    } finally {
      setDeletingValue('');
    }
  };

  return (
    <section ref={sectionRef} className="wh-panel wh-settings-section" id="settings-transaction-methods">
      <div className="wh-section-head">
        <div className="wh-settings-section__head-main">
          {typeof onBackToActions === 'function' ? (
            <button type="button" className="wh-settings-section__back" onClick={onBackToActions}>
              ← Back to actions
            </button>
          ) : null}
          <h3>Transaction Methods</h3>
        </div>
        <span className="wh-location-row__count">{methods.length} methods</span>
      </div>
      <p className="wh-setup-form-panel__hint">
        Add payment methods used on direct sales, receipts, and order records across the platform.
      </p>

      <form className="wh-setup-form" onSubmit={handleSubmit}>
        <label className="wh-setup-field">
          <span>New method name</span>
          <input
            ref={addInputRef}
            value={methodName}
            onChange={(e) => setMethodName(e.target.value)}
            placeholder="e.g. Orange Money"
            maxLength={80}
            required
          />
        </label>
        <button type="submit" className="wh-hero__btn" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add transaction method'}
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
        <p className="wh-empty">Loading methods…</p>
      ) : (
        <div className="accounts-table-wrap-lite wh-setup-table">
          <table className="accounts-table-lite">
            <thead>
              <tr>
                <th align="left">Method</th>
                <th align="left">Stored value</th>
                <th align="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {methods.length === 0 ? (
                <tr>
                  <td colSpan={3} className="accounts-table-empty">
                    No transaction methods available.
                  </td>
                </tr>
              ) : (
                methods.map((method) => {
                  const isEditing = editingValue === method.value;
                  const isDeleting = deletingValue === method.value;
                  return (
                    <tr key={method.value}>
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
                          method.name
                        )}
                      </td>
                      <td>
                        <code className="wh-settings-code">{method.value}</code>
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
                                disabled={Boolean(deletingValue)}
                                onClick={() => startEdit(method)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="wh-setup-btn wh-setup-btn--danger wh-setup-btn--compact"
                                disabled={Boolean(deletingValue) || Boolean(editingValue)}
                                onClick={() => void handleDelete(method)}
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
