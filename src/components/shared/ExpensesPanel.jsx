import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import {
  EXPENSE_CATEGORIES_UPDATED_EVENT,
  fetchExpenseCategories,
} from '../../api/expenseCategoriesApi';
import {
  createAdminExpense,
  createShopExpense,
  fetchAllExpenses,
  fetchShopExpenses,
} from '../../api/shopExpensesApi';
import { fetchWarehouses, warehouseId } from '../../api/warehouseApi';
import { formatMoneyXaf } from '../../utils/formatMoneyXaf';
import './ExpensesPanel.css';

function formatExpenseDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export default function ExpensesPanel({ mode = 'admin', shop = null }) {
  const client = useAxiosPrivate();
  const isAdmin = mode === 'admin';
  const shopId = warehouseId(shop);

  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouseLocations, setWarehouseLocations] = useState([]);
  const [shopLocations, setShopLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formShopId, setFormShopId] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const loadCategories = useCallback(async () => {
    try {
      const rows = await fetchExpenseCategories(client);
      setCategories(Array.isArray(rows) ? rows : []);
    } catch {
      setCategories([]);
    }
  }, [client]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (isAdmin) {
        const rows = await fetchAllExpenses(client);
        setExpenses(Array.isArray(rows) ? rows : []);
      } else {
        if (!shopId) {
          setExpenses([]);
          return;
        }
        const rows = await fetchShopExpenses(client, shopId);
        setExpenses(Array.isArray(rows) ? rows : []);
      }
    } catch (err) {
      setExpenses([]);
      setError(err?.response?.data?.message || err?.message || 'Could not load expenses.');
    } finally {
      setLoading(false);
    }
  }, [client, isAdmin, shopId]);

  const loadLocations = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await fetchWarehouses(client);
      const mains = Array.isArray(data?.mainWarehouses) ? data.mainWarehouses : [];
      const subs = Array.isArray(data?.subWarehouses) ? data.subWarehouses : [];
      setWarehouseLocations(mains);
      setShopLocations(subs);
    } catch {
      setWarehouseLocations([]);
      setShopLocations([]);
    }
  }, [client, isAdmin]);

  useEffect(() => {
    loadCategories().catch(() => {});
    loadLocations().catch(() => {});
  }, [loadCategories, loadLocations]);

  useEffect(() => {
    loadExpenses().catch(() => {});
  }, [loadExpenses]);

  useEffect(() => {
    if (!isAdmin && shopId) {
      setFormShopId(shopId);
    }
  }, [isAdmin, shopId]);

  useEffect(() => {
    const onCategoriesUpdated = () => {
      loadCategories().catch(() => {});
    };
    window.addEventListener(EXPENSE_CATEGORIES_UPDATED_EVENT, onCategoriesUpdated);
    return () => window.removeEventListener(EXPENSE_CATEGORIES_UPDATED_EVENT, onCategoriesUpdated);
  }, [loadCategories]);

  const mapLocationOption = (location) => {
    const id = warehouseId(location);
    const label = [location?.name, location?.city].filter(Boolean).join(' · ');
    return id && label ? { id, label } : null;
  };

  const warehouseOptions = useMemo(() => {
    return warehouseLocations.map(mapLocationOption).filter(Boolean);
  }, [warehouseLocations]);

  const shopOptions = useMemo(() => {
    return shopLocations.map(mapLocationOption).filter(Boolean);
  }, [shopLocations]);

  const resetForm = () => {
    setFormCategoryId('');
    setFormAmount('');
    setFormDescription('');
    if (isAdmin) setFormShopId('');
    else setFormShopId(shopId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const targetShopId = isAdmin ? String(formShopId || '').trim() : shopId;
    const categoryId = String(formCategoryId || '').trim();
    const amount = Number(formAmount);
    const description = String(formDescription || '').trim();

    if (!targetShopId) {
      setError('Select a warehouse or shop for this expense.');
      return;
    }
    if (!categoryId) {
      setError('Select an expense category.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { categoryId, amount, description };
      const created = isAdmin
        ? await createAdminExpense(client, { ...payload, shopId: targetShopId })
        : await createShopExpense(client, targetShopId, payload);

      if (created) {
        setExpenses((prev) => [created, ...prev]);
      } else {
        await loadExpenses();
      }

      setSuccess('Expense recorded.');
      resetForm();
      setShowForm(false);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not record expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const noCategories = categories.length === 0;
  const salesNeedsShop = !isAdmin && !shopId;

  return (
    <div className="expenses-panel wh-panel">
      <div className="expenses-panel__head">
        <div>
          <h2>{isAdmin ? 'Expenses' : 'Store expenses'}</h2>
          <p className="expenses-panel__lead">
            {isAdmin
              ? 'View expenses from every warehouse and shop and record new ones.'
              : shop?.name
                ? `Expenses for ${shop.name}${shop.city ? ` · ${shop.city}` : ''}.`
                : 'Select a shop to view and record expenses.'}
          </p>
        </div>
        <button
          type="button"
          className="wh-hero__btn"
          disabled={noCategories || salesNeedsShop}
          onClick={() => {
            setShowForm((open) => !open);
            setError('');
            setSuccess('');
          }}
        >
          {showForm ? 'Cancel' : 'Add expense'}
        </button>
      </div>

      {noCategories ? (
        <p className="expenses-panel__hint wh-empty">
          No expense categories yet. An admin must add categories under Settings → Expense categories
          before expenses can be recorded.
        </p>
      ) : null}

      {showForm ? (
        <form className="expenses-panel__form wh-setup-form" onSubmit={handleSubmit}>
          {isAdmin ? (
            <label className="wh-setup-field">
              <span>Location</span>
              <select
                value={formShopId}
                onChange={(e) => setFormShopId(e.target.value)}
                required
              >
                <option value="">Select warehouse or shop…</option>
                {warehouseOptions.length > 0 ? (
                  <optgroup label="Warehouses">
                    {warehouseOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {shopOptions.length > 0 ? (
                  <optgroup label="Shops">
                    {shopOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>
          ) : null}

          <label className="wh-setup-field">
            <span>Category</span>
            <select
              value={formCategoryId}
              onChange={(e) => setFormCategoryId(e.target.value)}
              required
            >
              <option value="">Select category…</option>
              {categories.map((category) => (
                <option key={category._id} value={category._id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="wh-setup-field">
            <span>Amount (XAF)</span>
            <input
              type="number"
              min="0"
              step="1"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              placeholder="0"
              required
            />
          </label>

          <label className="wh-setup-field expenses-panel__field--wide">
            <span>Description</span>
            <textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Optional notes about this expense"
              maxLength={500}
              rows={3}
            />
          </label>

          <button type="submit" className="wh-hero__btn" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save expense'}
          </button>
        </form>
      ) : null}

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

      {salesNeedsShop ? (
        <p className="wh-empty">Select a shop in the sidebar to view expenses.</p>
      ) : loading ? (
        <p className="wh-empty">Loading expenses…</p>
      ) : (
        <div className="expenses-panel__table-wrap accounts-table-wrap-lite">
          <table className="accounts-table-lite expenses-panel__table">
            <thead>
              <tr>
                <th align="left">Category</th>
                <th align="right">Amount</th>
                <th align="left">Description</th>
                <th align="left">Location</th>
                <th align="left">Date</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="accounts-table-empty">
                    No expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((row) => (
                  <tr key={row._id}>
                    <td>{row.category || '—'}</td>
                    <td align="right">{formatMoneyXaf(row.amount)}</td>
                    <td>{row.description || '—'}</td>
                    <td>{row.location || '—'}</td>
                    <td>{formatExpenseDate(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
