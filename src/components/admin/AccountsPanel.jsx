import { useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useAuth from '../../hooks/useAuth';
import {
  activateUser,
  createWholesalerAccount,
  deletePlatformAccount,
  fetchAllPlatformAccounts,
  formatAssignedShopNames,
  setUserPasswordByAdmin,
  updatePlatformAccount,
  updateSalesmanShops,
} from '../../api/adminApi';
import { fetchWarehouses, warehouseId } from '../../api/warehouseApi';
import { fetchUserById } from '../../api/authProfile';
import BusinessLocationSelect from '../BusinessLocationSelect';
import useBusinessCities from '../../hooks/useBusinessCities';
import { AppModal } from '../AppDialog';
import { friendlyApiErrorMessage } from '../../utils/apiBaseUrl';
import './AccountsPanel.css';

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

const EMPTY_WHOLESALER_FORM = {
  name: '',
  businessName: '',
  businessAddress: '',
  email: '',
  tel: '',
  whatsappNumber: '',
  password: '',
};

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected', label: 'Rejected' },
];

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
      adminNotes: '',
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
    adminNotes: String(user.adminNotes ?? '').trim(),
  };
}

function isSalespersonRole(role) {
  const r = String(role || '').toLowerCase();
  return r === 'salesman' || r === 'salesperson' || r === 'sales';
}

const ROLE_FILTERS = [
  { id: 'all', label: 'All accounts' },
  { id: 'wholesaler', label: 'Vendors' },
  { id: 'salesman', label: 'Staff' },
  { id: 'admin', label: 'Admins' },
];

function unwrapUserPayload(data) {
  if (data == null) return null;
  const inner = data?.data && typeof data.data === 'object' ? data.data : data;
  return inner?.user ?? inner;
}

function formatDateTime(iso) {
  if (iso == null || iso === '') return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(iso);
  }
}

function pickUserEmail(u) {
  if (!u || typeof u !== 'object') return '';
  return String(u.email ?? u.emailAddress ?? u.mail ?? u.contactEmail ?? '').trim();
}

function formatRoleLabel(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'salesman' || r === 'salesperson' || r === 'sales') return 'Staff';
  if (r === 'wholesaler') return 'Vendor';
  if (r === 'admin') return 'Admin';
  return r || '—';
}

function formatAccountPhoneDisplay(raw) {
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

export default function AccountsPanel({ onPendingCountChange }) {
  const client = useAxiosPrivate();
  const { auth } = useAuth();
  const { isValidBusinessCity } = useBusinessCities();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_WHOLESALER_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(() => buildEditFormFromUser(null));
  const [editShopIds, setEditShopIds] = useState([]);
  const [shops, setShops] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');
  /** Passwords shown in admin UI only for this browser session (never loaded from DB). */
  const [ephemeralPasswords, setEphemeralPasswords] = useState({});

  const pickCredentialNote = useCallback(
    (u) => {
      const id = String(u?._id ?? u?.id ?? '').trim();
      const fromSession = id ? ephemeralPasswords[id] : '';
      return String(fromSession || u?.passwordDisplay || '').trim();
    },
    [ephemeralPasswords],
  );

  const currentUserId = String(auth?.userId || '').trim();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchAllPlatformAccounts(client);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsers([]);
      setLoadError(friendlyApiErrorMessage(err, 'Could not load platform accounts.'));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const pendingWholesalers = useMemo(
    () => users.filter((u) => String(u.role).toLowerCase() === 'wholesaler' && String(u.accountStatus).toLowerCase() === 'pending'),
    [users],
  );

  useEffect(() => {
    onPendingCountChange?.(pendingWholesalers.length);
  }, [pendingWholesalers.length, onPendingCountChange]);

  const filteredRows = useMemo(() => {
    let rows = users;
    if (roleFilter !== 'all') {
      rows = rows.filter((u) => {
        const r = String(u.role || '').toLowerCase();
        if (roleFilter === 'salesman') return r === 'salesman' || r === 'salesperson' || r === 'sales';
        return r === roleFilter;
      });
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((u) => {
      const haystack = [
        u.name,
        u.businessName,
        u.business_name,
        u.tel,
        u.whatsappNumber,
        pickUserEmail(u),
        u.role,
        u.accountStatus,
        pickCredentialNote(u),
        formatAssignedShopNames(u),
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return haystack.includes(q);
    });
  }, [users, roleFilter, searchQuery, pickCredentialNote]);

  const openOwnerDetail = useCallback(
    async (u) => {
      const id = String(u._id ?? u.id ?? '').trim();
      if (!id) return;
      setDetailRecord(u);
      setDetailError('');
      setResetPassword('');
      setResetError('');
      setResetSuccess('');
      setDetailOpen(true);
      setDetailLoading(true);
      try {
        const raw = await fetchUserById(client, id);
        const merged = unwrapUserPayload(raw);
        if (merged && typeof merged === 'object') {
          setDetailRecord((prev) => ({ ...(prev || {}), ...merged }));
        }
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || 'Could not load full profile.';
        setDetailError(String(msg));
      } finally {
        setDetailLoading(false);
      }
    },
    [client],
  );

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailRecord(null);
    setDetailError('');
    setDetailLoading(false);
    setResetPassword('');
    setResetError('');
    setResetSuccess('');
    setDeleteError('');
  }, []);

  const canDeleteAccount = useCallback(
    (user) => {
      const id = String(user?._id ?? user?.id ?? '').trim();
      if (!id) return false;
      return id !== currentUserId;
    },
    [currentUserId],
  );

  const handleDeleteAccount = useCallback(
    async (user) => {
      const id = String(user?._id ?? user?.id ?? '').trim();
      if (!id || !canDeleteAccount(user)) return;

      const name =
        String(user?.name || '').trim() ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() ||
        'this account';
      const role = formatRoleLabel(user?.role);
      const ok = window.confirm(
        `Delete ${name} (${role})?\n\nThis permanently removes the account. Orders already linked to this user are not deleted.`,
      );
      if (!ok) return;

      setDeletingUserId(id);
      setDeleteError('');
      try {
        await deletePlatformAccount(client, id);
        if (String(detailRecord?._id ?? detailRecord?.id ?? '') === id) {
          closeDetail();
        }
        setDeleteError('');
        await load();
      } catch (err) {
        const msg = err?.response?.data?.message || err?.message || 'Could not delete account.';
        setDeleteError(String(msg));
      } finally {
        setDeletingUserId('');
      }
    },
    [canDeleteAccount, client, closeDetail, detailRecord, load],
  );

  const openAddAccount = useCallback(() => {
    setAddForm(EMPTY_WHOLESALER_FORM);
    setAddError('');
    setAddSuccess('');
    setAddOpen(true);
  }, []);

  const closeAddAccount = useCallback(() => {
    if (addSubmitting) return;
    setAddOpen(false);
    setAddForm(EMPTY_WHOLESALER_FORM);
    setAddError('');
  }, [addSubmitting]);

  const openEditAccount = useCallback(
    async (user) => {
      const id = String(user?._id ?? user?.id ?? '').trim();
      if (!id) return;
      setEditRecord(user);
      setEditForm(buildEditFormFromUser(user));
      setEditError('');
      setEditSuccess('');
      setEditOpen(true);

      const assigned = Array.isArray(user?.assignedShops) ? user.assignedShops : [];
      setEditShopIds(assigned.map((s) => warehouseId(s)).filter(Boolean));

      if (isSalespersonRole(user?.role)) {
        try {
          const wh = await fetchWarehouses(client);
          setShops(wh.subWarehouses || []);
        } catch {
          setShops([]);
        }
      } else {
        setShops([]);
      }
    },
    [client],
  );

  const closeEditAccount = useCallback(() => {
    if (editSubmitting) return;
    setEditOpen(false);
    setEditRecord(null);
    setEditForm(buildEditFormFromUser(null));
    setEditShopIds([]);
    setEditError('');
    setEditSuccess('');
  }, [editSubmitting]);

  const handleEditFieldChange = useCallback((e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
    setEditSuccess('');
  }, []);

  const toggleEditShop = useCallback((shopId) => {
    const key = String(shopId);
    setEditShopIds((prev) =>
      prev.includes(key) ? prev.filter((id) => id !== key) : [...prev, key],
    );
    setEditSuccess('');
  }, []);

  const submitEditAccount = async (e) => {
    e.preventDefault();
    const id = String(editRecord?._id ?? editRecord?.id ?? '').trim();
    if (!id) return;

    const n = editForm.name.trim();
    const bn = editForm.businessName.trim();
    const ba = editForm.businessAddress.trim();
    const t = normalizeCmPhone(editForm.tel);
    const wa = normalizeCmPhone(editForm.whatsappNumber);

    if (!n || n.length < 2) {
      setEditError('Name must be at least 2 characters.');
      return;
    }
    if (!bn || bn.length < 2) {
      setEditError('Business name must be at least 2 characters.');
      return;
    }
    if (!isValidBusinessCity(ba)) {
      setEditError('Please select a valid business city from the dropdown.');
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
    setEditSuccess('');
    try {
      const updated = await updatePlatformAccount(client, id, {
        name: n,
        businessName: bn,
        businessAddress: ba,
        tel: t,
        whatsappNumber: wa,
        email: editForm.email.trim(),
        accountStatus: editForm.accountStatus,
        adminNotes: editForm.adminNotes.trim(),
      });

      let finalUser = updated;
      if (isSalespersonRole(editRecord?.role)) {
        finalUser = await updateSalesmanShops(client, id, editShopIds);
      }

      const merged = finalUser && typeof finalUser === 'object' ? finalUser : updated;
      setUsers((prev) =>
        prev.map((u) => (String(u._id ?? u.id) === id ? { ...u, ...merged } : u)),
      );
      if (String(detailRecord?._id ?? detailRecord?.id ?? '') === id) {
        setDetailRecord((prev) => ({ ...(prev || {}), ...merged }));
      }
      setEditSuccess('Account updated.');
      await load();
    } catch (err) {
      setEditError(err?.response?.data?.message || err?.message || 'Could not update account.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleAddFieldChange = useCallback((e) => {
    const { name, value } = e.target;
    setAddForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const submitAddAccount = async (e) => {
    e.preventDefault();
    const n = addForm.name.trim();
    const bn = addForm.businessName.trim();
    const ba = addForm.businessAddress.trim();
    const t = normalizeCmPhone(addForm.tel);
    const wa = normalizeCmPhone(addForm.whatsappNumber);

    if (!n || n.length < 2) {
      setAddError('Name must be at least 2 characters.');
      return;
    }
    if (!bn || bn.length < 2) {
      setAddError('Business name must be at least 2 characters.');
      return;
    }
    if (!isValidBusinessCity(ba)) {
      setAddError('Please select a valid business city from the dropdown.');
      return;
    }
    if (!isValidEmail(addForm.email)) {
      setAddError('Please enter a valid email address, or leave it blank.');
      return;
    }
    if (!isValidCmPhone(t)) {
      setAddError('Enter a valid phone: 9 digits (e.g. 677184257 or +237677184257).');
      return;
    }
    if (!isValidCmPhone(wa)) {
      setAddError('Enter a valid WhatsApp number: 9 digits (e.g. 677184257 or +237677184257).');
      return;
    }
    if (!addForm.password || addForm.password.length < 8) {
      setAddError('Password must be at least 8 characters.');
      return;
    }

    setAddSubmitting(true);
    setAddError('');
    setAddSuccess('');
    try {
      const created = await createWholesalerAccount(client, {
        name: n,
        businessName: bn,
        businessAddress: ba,
        tel: t,
        whatsappNumber: wa,
        password: addForm.password,
        ...(addForm.email.trim() ? { email: addForm.email.trim() } : {}),
      });
      const createdUser = created?.user ?? created?.data?.user ?? {};
      const createdId = String(createdUser.id ?? createdUser._id ?? '').trim();
      const pwd =
        String(createdUser.passwordDisplay ?? addForm.password ?? '').trim() || addForm.password;
      if (createdId && pwd) {
        setEphemeralPasswords((prev) => ({ ...prev, [createdId]: pwd }));
      }
      setAddSuccess(
        `Vendor account created. Password shown here for this admin session only (not stored in database): ${pwd}`,
      );
      setAddForm(EMPTY_WHOLESALER_FORM);
      setRoleFilter('wholesaler');
      await load();
    } catch (err) {
      setAddError(err?.response?.data?.message || err?.message || 'Could not create account.');
    } finally {
      setAddSubmitting(false);
    }
  };

  const submitPasswordReset = async (e) => {
    e.preventDefault();
    const id = String(detailRecord?._id ?? detailRecord?.id ?? '').trim();
    if (!id) return;
    if (!resetPassword || resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    setResetSubmitting(true);
    setResetError('');
    setResetSuccess('');
    try {
      const resetRes = await setUserPasswordByAdmin(client, id, resetPassword);
      const updated = resetRes?.data ?? resetRes ?? {};
      const displayPwd =
        String(updated.passwordDisplay ?? resetPassword).trim() || resetPassword;
      setEphemeralPasswords((prev) => ({ ...prev, [id]: displayPwd }));
      setResetSuccess(
        'Password updated (hashed in database). Copy it now — plain text is kept only in this admin session for a limited time, not in MongoDB.',
      );
      setDetailRecord((prev) => (prev ? { ...prev, passwordDisplay: displayPwd } : prev));
      setUsers((prev) =>
        prev.map((u) =>
          String(u._id ?? u.id) === id ? { ...u, passwordDisplay: displayPwd } : u,
        ),
      );
      setResetPassword('');
    } catch (err) {
      setResetError(err?.response?.data?.message || err?.message || 'Could not update password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  const detailRows = useMemo(() => {
    const u = detailRecord;
    if (!u) return [];
    const name =
      String(u.name ?? '').trim() ||
      [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
      '—';
    const rows = [
      ['Full name', name],
      ['Role', formatRoleLabel(u.role)],
      ['Email', pickUserEmail(u) || '—'],
      ['Phone', formatAccountPhoneDisplay(u.tel ?? u.phone ?? u.phoneNumber)],
      ['WhatsApp', formatAccountPhoneDisplay(u.whatsappNumber ?? u.whatsapp)],
      ['Business name', String(u.businessName ?? u.business_name ?? '').trim() || '—'],
      ['Business address', String(u.businessAddress ?? u.business_address ?? u.deliveryAddress ?? '').trim() || '—'],
      ['Account status', String(u.accountStatus ?? '').trim() || '—'],
      [
        'Password',
        pickCredentialNote(u) ||
          'Not stored in database — visible here only after you create or reset a password (same admin session, limited time)',
      ],
      ['Assigned shops', formatAssignedShopNames(u)],
      ['Registered', formatDateTime(u.createdAt ?? u.created_at)],
      ['Last updated', formatDateTime(u.updatedAt ?? u.updated_at)],
    ];
    if (u.rejectionReason) rows.push(['Rejection reason', String(u.rejectionReason)]);
    if (u.adminNotes) rows.push(['Admin notes', String(u.adminNotes)]);
    return rows;
  }, [detailRecord, pickCredentialNote]);

  return (
    <div className="accounts-panel-lite">
      <AppModal
        open={detailOpen}
        title="Account details"
        wide
        onClose={closeDetail}
        footer={
          <>
            {detailRecord && canDeleteAccount(detailRecord) ? (
              <button
                type="button"
                className="app-dialog__btn accounts-delete-btn"
                disabled={Boolean(deletingUserId)}
                onClick={() => void handleDeleteAccount(detailRecord)}
              >
                {deletingUserId ? 'Deleting…' : 'Delete account'}
              </button>
            ) : null}
            <button type="button" className="app-dialog__btn app-dialog__btn--primary" onClick={closeDetail}>
              Close
            </button>
          </>
        }
      >
        {detailLoading && !detailRecord ? <p className="accounts-detail-hint">Loading profile…</p> : null}
        {detailError ? (
          <p className="accounts-detail-error" role="alert">
            {detailError}
          </p>
        ) : null}
        {deleteError ? (
          <p className="accounts-detail-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        {detailRecord ? (
          <>
            <dl className="accounts-detail-dl">
              {detailRows.map(([label, value]) => (
                <div key={label} className="accounts-detail-row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <form className="accounts-reset-form" onSubmit={submitPasswordReset}>
              <h4 className="accounts-reset-form__title">Set new password</h4>
              <p className="accounts-reset-form__hint">
                Updates the login password and saves it on this account record for admin reference.
              </p>
              <label>
                New password
                <input
                  type="text"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Min. 8 characters"
                />
              </label>
              {resetError ? <p className="accounts-detail-error">{resetError}</p> : null}
              {resetSuccess ? <p className="accounts-add-success">{resetSuccess}</p> : null}
              <button type="submit" className="accounts-activate-btn" disabled={resetSubmitting}>
                {resetSubmitting ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </>
        ) : null}
        {!detailLoading && !detailError && detailOpen && !detailRecord ? (
          <p className="accounts-detail-hint">No data.</p>
        ) : null}
      </AppModal>

      <AppModal
        open={editOpen}
        title={editRecord ? `Edit account — ${editRecord.name || 'Account'}` : 'Edit account'}
        wide
        onClose={closeEditAccount}
        footer={
          <>
            <button
              type="button"
              className="app-dialog__btn"
              onClick={closeEditAccount}
              disabled={editSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="accounts-edit-form"
              className="app-dialog__btn app-dialog__btn--primary"
              disabled={editSubmitting}
            >
              {editSubmitting ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <p className="accounts-add-hint">
          Update profile details, account status, and shop assignments for staff accounts.
        </p>
        {editError ? (
          <p className="accounts-detail-error" role="alert">
            {editError}
          </p>
        ) : null}
        {editSuccess ? <p className="accounts-add-success">{editSuccess}</p> : null}
        {editRecord ? (
          <form id="accounts-edit-form" className="accounts-add-form" onSubmit={submitEditAccount}>
            <label>
              Full name
              <input name="name" value={editForm.name} onChange={handleEditFieldChange} required autoComplete="name" />
            </label>
            <label>
              Business name
              <input
                name="businessName"
                value={editForm.businessName}
                onChange={handleEditFieldChange}
                required
                autoComplete="organization"
              />
            </label>
            <label>
              Business city
              <BusinessLocationSelect
                name="businessAddress"
                value={editForm.businessAddress}
                onChange={handleEditFieldChange}
                mode="required"
              />
            </label>
            <label>
              Phone
              <input type="tel" name="tel" value={editForm.tel} onChange={handleEditFieldChange} required autoComplete="tel" />
            </label>
            <label>
              WhatsApp
              <input
                type="tel"
                name="whatsappNumber"
                value={editForm.whatsappNumber}
                onChange={handleEditFieldChange}
                required
                autoComplete="tel"
              />
            </label>
            <label>
              Email <span className="accounts-add-optional">(optional)</span>
              <input type="email" name="email" value={editForm.email} onChange={handleEditFieldChange} autoComplete="email" />
            </label>
            <label>
              Account status
              <select name="accountStatus" value={editForm.accountStatus} onChange={handleEditFieldChange}>
                {ACCOUNT_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Admin notes <span className="accounts-add-optional">(optional)</span>
              <input name="adminNotes" value={editForm.adminNotes} onChange={handleEditFieldChange} />
            </label>
            {isSalespersonRole(editRecord.role) ? (
              <div className="accounts-edit-shops">
                <span className="accounts-edit-shops__label">Assigned shops</span>
                {shops.length === 0 ? (
                  <p className="accounts-edit-shops__hint">No shops available. Create shops in Shop setup first.</p>
                ) : (
                  <ul className="accounts-edit-shops__list">
                    {shops.map((shop) => {
                      const shopKey = warehouseId(shop);
                      const checked = editShopIds.includes(shopKey);
                      return (
                        <li key={shopKey}>
                          <label>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleEditShop(shopKey)}
                            />
                            <span>
                              {shop.name}
                              {shop.city ? ` · ${shop.city}` : ''}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </form>
        ) : null}
      </AppModal>

      <AppModal
        open={addOpen}
        title="Add vendor account"
        wide
        onClose={closeAddAccount}
        footer={
          <>
            <button
              type="button"
              className="app-dialog__btn"
              onClick={closeAddAccount}
              disabled={addSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="accounts-add-wholesaler-form"
              className="app-dialog__btn app-dialog__btn--primary"
              disabled={addSubmitting}
            >
              {addSubmitting ? 'Creating…' : 'Create account'}
            </button>
          </>
        }
      >
        <p className="accounts-add-hint">
          Creates an active vendor account. The password is stored on the account record for admin reference.
        </p>
        {addError ? (
          <p className="accounts-detail-error" role="alert">
            {addError}
          </p>
        ) : null}
        {addSuccess ? <p className="accounts-add-success">{addSuccess}</p> : null}
        <form id="accounts-add-wholesaler-form" className="accounts-add-form" onSubmit={submitAddAccount}>
          <label>
            Full name
            <input name="name" value={addForm.name} onChange={handleAddFieldChange} required autoComplete="name" />
          </label>
          <label>
            Business name
            <input
              name="businessName"
              value={addForm.businessName}
              onChange={handleAddFieldChange}
              required
              autoComplete="organization"
            />
          </label>
          <label>
            Business city
            <BusinessLocationSelect
              name="businessAddress"
              value={addForm.businessAddress}
              onChange={handleAddFieldChange}
              mode="required"
            />
          </label>
          <label>
            Phone
            <input type="tel" name="tel" value={addForm.tel} onChange={handleAddFieldChange} required autoComplete="tel" />
          </label>
          <label>
            WhatsApp
            <input
              type="tel"
              name="whatsappNumber"
              value={addForm.whatsappNumber}
              onChange={handleAddFieldChange}
              required
              autoComplete="tel"
            />
          </label>
          <label>
            Email <span className="accounts-add-optional">(optional)</span>
            <input type="email" name="email" value={addForm.email} onChange={handleAddFieldChange} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="text"
              name="password"
              value={addForm.password}
              onChange={handleAddFieldChange}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </label>
        </form>
      </AppModal>

      <div className="accounts-toolbar-lite">
        {ROLE_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`accounts-tab-btn ${roleFilter === tab.id ? 'active' : ''}`}
            onClick={() => setRoleFilter(tab.id)}
          >
            {tab.label}
            {tab.id === 'wholesaler' && pendingWholesalers.length > 0
              ? ` (${pendingWholesalers.length} pending)`
              : ''}
          </button>
        ))}
        <label className="accounts-search-lite">
          <span className="accounts-search-lite__label">Search</span>
          <input
            type="search"
            className="accounts-search-lite__input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Name, role, phone, email, password on file…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="button" className="accounts-add-btn" onClick={openAddAccount}>
          Add account
        </button>
        <button type="button" className="accounts-refresh-btn" onClick={() => load()}>
          Refresh
        </button>
      </div>

      <p className="accounts-panel-summary">
        Showing <strong>{filteredRows.length}</strong> of <strong>{users.length}</strong> platform accounts.
        Passwords appear after that user signs in once, or when you set one via <strong>View → Set new password</strong>.
      </p>

      {loadError ? (
        <p className="accounts-detail-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {deleteError && !detailOpen ? (
        <p className="accounts-detail-error" role="alert">
          {deleteError}
        </p>
      ) : null}

      {loading ? (
        <p className="accounts-loading-lite">Loading...</p>
      ) : (
        <div className="accounts-table-wrap-lite">
          <table className="accounts-table-lite accounts-table-lite--wide">
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Role</th>
                <th align="left">Business</th>
                <th align="left">Phone</th>
                <th align="left">Email</th>
                <th align="left">Password</th>
                <th align="left">Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="accounts-table-empty">
                    {searchQuery.trim() ? 'No accounts match your search.' : 'No accounts in this filter.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((u) => {
                  const id = String(u._id ?? u.id);
                  const isPendingWholesaler =
                    String(u.role).toLowerCase() === 'wholesaler' &&
                    String(u.accountStatus).toLowerCase() === 'pending';
                  const credential = pickCredentialNote(u);
                  return (
                    <tr key={id}>
                      <td>
                        <button
                          type="button"
                          className="accounts-name-btn"
                          title="View full account details"
                          onClick={() => void openOwnerDetail(u)}
                        >
                          {u.name || '—'}
                        </button>
                      </td>
                      <td>{formatRoleLabel(u.role)}</td>
                      <td>{u.businessName ?? u.business_name ?? '—'}</td>
                      <td>{formatAccountPhoneDisplay(u.tel ?? u.phone ?? u.phoneNumber)}</td>
                      <td>{pickUserEmail(u) || '—'}</td>
                      <td>
                        <code className="accounts-credential-cell">
                          {credential || 'Not stored'}
                        </code>
                      </td>
                      <td>{String(u.accountStatus || '—')}</td>
                      <td align="center">
                        <div className="accounts-row-actions">
                          {isPendingWholesaler ? (
                            <button
                              type="button"
                              className="accounts-activate-btn"
                              onClick={() => activateUser(client, id).then(load)}
                            >
                              Activate
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="accounts-edit-btn"
                            onClick={() => void openEditAccount(u)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="accounts-view-btn"
                            onClick={() => void openOwnerDetail(u)}
                          >
                            View
                          </button>
                          {canDeleteAccount(u) ? (
                            <button
                              type="button"
                              className="accounts-delete-btn"
                              disabled={deletingUserId === id}
                              onClick={() => void handleDeleteAccount(u)}
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
      )}
    </div>
  );
}
