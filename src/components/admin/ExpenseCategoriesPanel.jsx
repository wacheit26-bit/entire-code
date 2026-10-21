import { useEffect, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  addExpenseCategory,
  deleteExpenseCategory,
  emitExpenseCategoriesUpdated,
  fetchExpenseCategories,
  updateExpenseCategory,
} from '../../api/expenseCategoriesApi';

export default function ExpenseCategoriesPanel({ sectionRef, addInputRef, onBackToActions }) {
  const client = useAxiosPrivate();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editingName, setEditingName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingValue, setDeletingValue] = useState('');

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchExpenseCategories(client);
      setCategories(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setCategories([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load expense categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories().catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const name = String(categoryName || '').trim();
    if (name.length < 2) {
      setError('Category name must be at least 2 characters.');
      return;
    }
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      const rows = await addExpenseCategory(client, name);
      setCategories(Array.isArray(rows) ? rows : []);
      setCategoryName('');
      setSuccess(`${name} added successfully.`);
      emitExpenseCategoriesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not add expense category.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (category) => {
    setEditingValue(category.value);
    setEditingName(category.name);
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
      setError('Category name must be at least 2 characters.');
      return;
    }

    const current = categories.find((c) => c.value === currentValue);
    if (current && nextName === current.name) {
      cancelEdit();
      return;
    }

    setSavingEdit(true);
    setError('');
    setSuccess('');
    try {
      const rows = await updateExpenseCategory(client, currentValue, nextName);
      setCategories(Array.isArray(rows) ? rows : []);
      setEditingValue('');
      setEditingName('');
      setSuccess(`${nextName} updated successfully.`);
      emitExpenseCategoriesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not update expense category.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (category) => {
    const name = String(category?.name || '').trim();
    const value = String(category?.value || '').trim();
    if (!value) return;

    const ok = window.confirm(`Delete ${name}?\n\nExisting expenses keep their records; new expenses cannot use this category.`);
    if (!ok) return;

    setDeletingValue(value);
    setError('');
    setSuccess('');
    try {
      const rows = await deleteExpenseCategory(client, value);
      setCategories(Array.isArray(rows) ? rows : []);
      if (editingValue === value) {
        setEditingValue('');
        setEditingName('');
      }
      setSuccess(`${name} deleted successfully.`);
      emitExpenseCategoriesUpdated();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete expense category.');
    } finally {
      setDeletingValue('');
    }
  };

  return (
    <section ref={sectionRef} className="wh-panel wh-settings-section" id="settings-expense-categories">
      <div className="wh-section-head">
        <div className="wh-settings-section__head-main">
          {typeof onBackToActions === 'function' ? (
            <button type="button" className="wh-settings-section__back" onClick={onBackToActions}>
              ← Back to actions
            </button>
          ) : null}
          <h3>Expense categories</h3>
        </div>
        <span className="wh-location-row__count">{categories.length} categories</span>
      </div>
      <p className="wh-setup-form-panel__hint">
        Categories appear in the expense dropdown when admins and salespeople record shop expenses.
      </p>

      <form className="wh-setup-form" onSubmit={handleSubmit}>
        <label className="wh-setup-field">
          <span>New category name</span>
          <input
            ref={addInputRef}
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            placeholder="e.g. Rent, Utilities, Transport"
            maxLength={80}
            required
          />
        </label>
        <button type="submit" className="wh-hero__btn" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add expense category'}
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
        <p className="wh-empty">Loading categories…</p>
      ) : (
        <div className="accounts-table-wrap-lite wh-setup-table">
          <table className="accounts-table-lite">
            <thead>
              <tr>
                <th align="left">Category</th>
                <th align="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={2} className="accounts-table-empty">
                    No expense categories yet. Add one above.
                  </td>
                </tr>
              ) : (
                categories.map((category) => {
                  const isEditing = editingValue === category.value;
                  const isDeleting = deletingValue === category.value;
                  return (
                    <tr key={category._id}>
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
                          category.name
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
                                disabled={Boolean(deletingValue)}
                                onClick={() => startEdit(category)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="wh-setup-btn wh-setup-btn--danger wh-setup-btn--compact"
                                disabled={Boolean(deletingValue) || Boolean(editingValue)}
                                onClick={() => void handleDelete(category)}
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
