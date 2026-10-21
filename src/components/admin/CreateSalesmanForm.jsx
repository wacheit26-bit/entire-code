import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import { postRegisterUser } from '../../api/registerApi';
import {
  deletePlatformAccount,
  fetchStaffList,
  formatAssignedShopNames,
  updatePlatformAccount,
  updateSalesmanShops,
} from '../../api/adminApi';
import { fetchWarehouses, warehouseId } from '../../api/warehouseApi';
import BusinessLocationSelect from '../BusinessLocationSelect';
import useBusinessCities from '../../hooks/useBusinessCities';
import { AppModal } from '../AppDialog';
import { getUserIdFromAccessToken } from '../../utils/jwtUser';
import './CreateSalesmanForm.css';

const SALESPERSON_BUSINESS_NAME = 'wachesales';

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

function staffRoleLabel(role) {
  const r = String(role || '').toLowerCase().trim();
  if (r === 'admin') return 'Admin';
  return 'Salesperson';
}

function isSalespersonRole(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'salesman' || r === 'salesperson' || r === 'sales';
}

function normalizeCmPhone(raw) {
  return String(raw || '').replace(/\s/g, '');
}

function isValidCmPhone(raw) {
  const v = normalizeCmPhone(raw);
  return /^(?:\+237|00237)?\d{9}$/.test(v);
}

function isValidEmail(raw) {
  const v = String(raw || '').trim();
  if (!v) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function pickUserEmail(user) {
  if (!user || typeof user !== 'object') return '';
  return String(user.email ?? user.emailAddress ?? user.mail ?? user.contactEmail ?? '').trim();
}

function formatStaffPhoneDisplay(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '—';

  let local = digits;
  if (local.startsWith('00237')) {
    local = local.slice(5);
  } else if (local.startsWith('237') && local.length >= 12) {
    local = local.slice(3);
  }
  if (local.length > 9) {
    local = local.slice(-9);
  }
  if (local.length !== 9) {
    const trimmed = String(raw || '').trim();
    if (trimmed.startsWith('+')) return trimmed;
    return trimmed ? `+237${trimmed.replace(/\D/g, '')}` : '—';
  }
  return `+237${local}`;
}

function buildEditFormFromUser(user) {
  if (!user) {
    return {
      name: '',
      businessName: '',
      businessAddress: '',
      email: '',
      tel: '',
      whatsappNumber: '',
      accountStatus: 'active',
    };
  }
  return {
    name: String(user.name || '').trim(),
    businessName: String(user.businessName ?? user.business_name ?? '').trim(),
    businessAddress: String(user.businessAddress ?? user.business_address ?? '').trim(),
    email: pickUserEmail(user),
    tel: String(user.tel ?? '').trim(),
    whatsappNumber: String(user.whatsappNumber ?? user.whatsapp ?? '').trim(),
    accountStatus: String(user.accountStatus || 'active').toLowerCase(),
  };
}

export default function CreateSalesmanForm() {
  const client = useAxiosPrivate();
  const { auth } = useAuth();
  const { isValidBusinessCity } = useBusinessCities();
  const currentUserId = useMemo(
    () => String(auth?.userId || getUserIdFromAccessToken(auth?.accessToken) || '').trim(),
    [auth?.accessToken, auth?.userId],
  );

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [shops, setShops] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');

  const [staffRole, setStaffRole] = useState('salesman');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [tel, setTel] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [password, setPassword] = useState('');
  const [assignedShopIds, setAssignedShopIds] = useState([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(buildEditFormFromUser(null));
  const [editShopIds, setEditShopIds] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rows, wh] = await Promise.all([
        fetchStaffList(client),
        fetchWarehouses(client),
      ]);
      setUsers(rows);
      setShops(wh.subWarehouses || []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load staff.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      const an = String(a?.name || '').toLowerCase();
      const bn = String(b?.name || '').toLowerCase();
      if (an < bn) return -1;
      if (an > bn) return 1;
      return 0;
    });
  }, [users]);

  const toggleCreateShop = (shopId) => {
    const key = String(shopId);
    setAssignedShopIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
  };

  const resetForm = () => {
    setStaffRole('salesman');
    setName('');
    setLocation('');
    setTel('');
    setWhatsappNumber('');
    setPassword('');
    setAssignedShopIds([]);
  };

  const canDeleteUser = useCallback(
    (user) => {
      const id = String(user?._id ?? user?.id ?? '').trim();
      return Boolean(id) && id !== currentUserId;
    },
    [currentUserId],
  );

  const openEditUser = (user) => {
    const id = String(user?._id ?? user?.id ?? '').trim();
    if (!id) return;
    setEditRecord(user);
    setEditForm(buildEditFormFromUser(user));
    setEditError('');
    const assigned = Array.isArray(user?.assignedShops) ? user.assignedShops : [];
    setEditShopIds(assigned.map((s) => warehouseId(s)).filter(Boolean));
    setEditOpen(true);
  };

  const closeEditUser = () => {
    if (editSubmitting) return;
    setEditOpen(false);
    setEditRecord(null);
    setEditForm(buildEditFormFromUser(null));
    setEditShopIds([]);
    setEditError('');
  };

  const handleDeleteUser = async (user) => {
    const id = String(user?._id ?? user?.id ?? '').trim();
    if (!id || !canDeleteUser(user)) return;

    const displayName = String(user?.name || '').trim() || 'this staff member';
    const ok = window.confirm(
      `Delete ${displayName} (${staffRoleLabel(user?.role)})?\n\nThis permanently removes the account.`,
    );
    if (!ok) return;

    setDeletingUserId(id);
    setError('');
    setSuccess('');
    try {
      await deletePlatformAccount(client, id);
      if (String(editRecord?._id ?? editRecord?.id ?? '') === id) {
        closeEditUser();
      }
      setSuccess(`${displayName} deleted.`);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not delete account.');
    } finally {
      setDeletingUserId('');
    }
  };

  const submitEditUser = async (event) => {
    event.preventDefault();
    const id = String(editRecord?._id ?? editRecord?.id ?? '').trim();
    if (!id) return;

    const salesperson = isSalespersonRole(editRecord?.role);
    const n = editForm.name.trim();
    const bn = salesperson ? SALESPERSON_BUSINESS_NAME : editForm.businessName.trim();
    const ba = editForm.businessAddress.trim();
    const t = normalizeCmPhone(editForm.tel);
    const wa = normalizeCmPhone(editForm.whatsappNumber);

    if (!n || n.length < 2) {
      setEditError('Name must be at least 2 characters.');
      return;
    }
    if (!salesperson && (!bn || bn.length < 2)) {
      setEditError('Business name must be at least 2 characters.');
      return;
    }
    if (!salesperson && !isValidBusinessCity(ba)) {
      setEditError('Please select a valid business city.');
      return;
    }
    if (salesperson && editShopIds.length === 0) {
      setEditError('Assign at least one Shop. Their business city comes from that Shop.');
      return;
    }
    if (!isValidEmail(editForm.email)) {
      setEditError('Please enter a valid email address, or leave it blank.');
      return;
    }
    if (!isValidCmPhone(t)) {
      setEditError('Enter a valid phone: 9 digits (e.g. 677184257 or +237677184257).');
      return;
    }
    if (!isValidCmPhone(wa)) {
      setEditError('Enter a valid WhatsApp number: 9 digits (e.g. 677184257 or +237677184257).');
      return;
    }

    setEditSubmitting(true);
    setEditError('');
    try {
      const payload = {
        name: n,
        businessName: bn,
        tel: t,
        whatsappNumber: wa,
        email: editForm.email.trim(),
        accountStatus: editForm.accountStatus,
      };
      if (!salesperson) {
        payload.businessAddress = ba;
      }

      await updatePlatformAccount(client, id, payload);
      if (salesperson) {
        await updateSalesmanShops(client, id, editShopIds);
      }

      setSuccess(`${n} updated.`);
      closeEditUser();
      await load();
    } catch (e) {
      setEditError(e?.response?.data?.message || e?.message || 'Could not update account.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setError('Name and password are required.');
      return;
    }

    const role = staffRole === 'admin' ? 'admin' : 'salesman';

    if (role === 'admin' && !isValidBusinessCity(location)) {
      setError('Please select a valid business city.');
      return;
    }

    if (role === 'salesman' && assignedShopIds.length === 0) {
      setError('Assign at least one Shop. Their business city comes from that Shop.');
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await postRegisterUser(client, {
        name: name.trim(),
        businessName: role === 'salesman' ? SALESPERSON_BUSINESS_NAME : undefined,
        ...(role === 'admin' ? { businessAddress: location.trim() } : {}),
        tel: tel.trim(),
        whatsappNumber: whatsappNumber.trim(),
        password,
        role,
        assignedShopIds: role === 'salesman' ? assignedShopIds : [],
      });
      resetForm();
      setSuccess(
        role === 'admin'
          ? 'Admin account created.'
          : 'Salesperson created. You can edit their details in the table below.',
      );
      await load();
      setShowCreateForm(false);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="sales-team-panel">
      <AppModal
        open={editOpen}
        title={`Edit ${staffRoleLabel(editRecord?.role)}`}
        wide
        onClose={closeEditUser}
        footer={
          <>
            <button
              type="button"
              className="app-dialog__btn"
              onClick={closeEditUser}
              disabled={editSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="staff-edit-form"
              className="app-dialog__btn app-dialog__btn--primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {editError ? (
          <p className="sales-team-panel__alert sales-team-panel__alert--err" role="alert">
            {editError}
          </p>
        ) : null}
        {editRecord ? (
          <form id="staff-edit-form" className="salesman-form-lite salesman-form-lite--modal" onSubmit={submitEditUser}>
            <label>
              Name
              <input
                name="name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            {!isSalespersonRole(editRecord.role) ? (
              <>
                <label>
                  Business name
                  <input
                    name="businessName"
                    value={editForm.businessName}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, businessName: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Business city
                  <BusinessLocationSelect
                    name="businessAddress"
                    value={editForm.businessAddress}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, businessAddress: e.target.value }))}
                    mode="required"
                  />
                </label>
              </>
            ) : (
              <p className="salesman-form-lite__role-note">
                Business city for this salesperson is set automatically from their assigned Shop(s).
              </p>
            )}
            <label>
              Phone
              <input
                type="tel"
                name="tel"
                value={editForm.tel}
                onChange={(e) => setEditForm((prev) => ({ ...prev, tel: e.target.value }))}
                required
              />
            </label>
            <label>
              WhatsApp
              <input
                type="tel"
                name="whatsappNumber"
                value={editForm.whatsappNumber}
                onChange={(e) => setEditForm((prev) => ({ ...prev, whatsappNumber: e.target.value }))}
                required
              />
            </label>
            <label>
              Email <span className="sales-team-table__optional">(optional)</span>
              <input
                type="email"
                name="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </label>
            <label>
              Account status
              <select
                name="accountStatus"
                value={editForm.accountStatus}
                onChange={(e) => setEditForm((prev) => ({ ...prev, accountStatus: e.target.value }))}
              >
                {ACCOUNT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {isSalespersonRole(editRecord.role) ? (
              <fieldset className="salesman-form-lite__shops">
                <legend>Assigned Shops (required)</legend>
                {!shops.length ? (
                  <p className="salesman-form-lite__shops-empty">No Shops yet — add Shops under Shop setup first.</p>
                ) : (
                  <ul>
                    {shops.map((shop) => {
                      const shopKey = warehouseId(shop);
                      return (
                        <li key={shopKey}>
                          <label>
                            <input
                              type="checkbox"
                              checked={editShopIds.includes(shopKey)}
                              onChange={() =>
                                setEditShopIds((prev) =>
                                  prev.includes(shopKey)
                                    ? prev.filter((value) => value !== shopKey)
                                    : [...prev, shopKey],
                                )
                              }
                            />
                            {shop.name}
                            {shop.city ? ` (${shop.city})` : ''}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            ) : null}
          </form>
        ) : null}
      </AppModal>

      <div className="sales-team-panel__top">
        <div>
          <h3>Staff</h3>
          <p>
            Create salespeople or admin accounts. Salespeople are registered under{' '}
            <strong>{SALESPERSON_BUSINESS_NAME}</strong>. Their business city is set automatically
            from the Shop you assign them to.
          </p>
        </div>
        <button
          type="button"
          className="sales-team-panel__create-btn"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setError('');
            setSuccess('');
          }}
        >
          {showCreateForm ? 'Close form' : 'Add staff member'}
        </button>
      </div>

      {error ? <p className="sales-team-panel__alert sales-team-panel__alert--err">{error}</p> : null}
      {success ? <p className="sales-team-panel__alert sales-team-panel__alert--ok">{success}</p> : null}

      {showCreateForm && (
        <form className="salesman-form-lite" onSubmit={submit}>
          <label>
            Account type
            <select
              value={staffRole}
              onChange={(e) => {
                setStaffRole(e.target.value);
                if (e.target.value === 'admin') setAssignedShopIds([]);
              }}
            >
              <option value="salesman">Salesperson</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          {staffRole === 'admin' ? (
            <label>
              Business city
              <BusinessLocationSelect
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                mode="required"
              />
            </label>
          ) : null}
          <label>
            Phone
            <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} required />
          </label>
          <label>
            WhatsApp
            <input type="tel" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </label>
          {staffRole === 'salesman' ? (
            <fieldset className="salesman-form-lite__shops">
              <legend>Assign to Shops (required — city comes from the first Shop selected)</legend>
              {!shops.length ? (
                <p className="salesman-form-lite__shops-empty">No Shops yet — add Shops under Shop setup first.</p>
              ) : (
                <ul>
                  {shops.map((shop) => {
                    const id = warehouseId(shop);
                    return (
                      <li key={id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={assignedShopIds.includes(id)}
                            onChange={() => toggleCreateShop(id)}
                          />
                          {shop.name}
                          {shop.city ? ` (${shop.city})` : ''}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>
          ) : (
            <p className="salesman-form-lite__role-note">
              Admin accounts use the platform admin role and do not require Shop assignments.
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting
              ? 'Creating...'
              : staffRole === 'admin'
                ? 'Create admin'
                : 'Create salesperson'}
          </button>
        </form>
      )}

      <div className="sales-team-panel__table-wrap">
        <table className="sales-team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Business</th>
              <th>City</th>
              <th>Assigned Shops</th>
              <th>Phone</th>
              <th align="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Loading staff...</td>
              </tr>
            ) : sortedUsers.length === 0 ? (
              <tr>
                <td colSpan={7}>No staff accounts yet.</td>
              </tr>
            ) : (
              sortedUsers.map((u) => {
                const id = String(u?._id ?? u?.id ?? `${u?.name || 'user'}`);
                const salesperson = isSalespersonRole(u?.role);
                const phoneDisplay = formatStaffPhoneDisplay(u?.tel);
                const whatsappDisplay = formatStaffPhoneDisplay(u?.whatsappNumber ?? u?.whatsapp);
                return (
                  <tr key={id}>
                    <td>{u?.name || '—'}</td>
                    <td>{staffRoleLabel(u?.role)}</td>
                    <td>{u?.businessName || '—'}</td>
                    <td>{u?.businessAddress || '—'}</td>
                    <td>{salesperson ? formatAssignedShopNames(u) : '—'}</td>
                    <td>
                      <div className="sales-team-table__phones">
                        <span>{phoneDisplay}</span>
                        {whatsappDisplay !== '—' && whatsappDisplay !== phoneDisplay ? (
                          <span className="sales-team-table__phone-sub">WhatsApp: {whatsappDisplay}</span>
                        ) : null}
                      </div>
                    </td>
                    <td align="right">
                      <div className="sales-team-table__actions">
                        <button
                          type="button"
                          className="sales-team-table__btn sales-team-table__btn--ghost"
                          onClick={() => openEditUser(u)}
                        >
                          Edit
                        </button>
                        {canDeleteUser(u) ? (
                          <button
                            type="button"
                            className="sales-team-table__btn sales-team-table__btn--danger"
                            disabled={Boolean(deletingUserId)}
                            onClick={() => void handleDeleteUser(u)}
                          >
                            {deletingUserId === id ? 'Deleting…' : 'Delete'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
