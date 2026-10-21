import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useAuth from '../hooks/useAuth';
import useAxiosPrivate from '../hooks/useAxiosPrivate';
import { getAccessToken } from '../api/tokenStore';
import { getUserIdFromAccessToken } from '../utils/jwtUser';
import { fetchOwnProfile, parseMeProfile, patchAuthProfile } from '../api/authProfile';
import BusinessLocationSelect from '../components/BusinessLocationSelect';
import useBusinessCities from '../hooks/useBusinessCities';
import { coerceBusinessLocation } from '../data/businessLocations';
import './MyAccountPage.css';

const PHONE_CODES = [
  { value: '+237', label: '+237 (CM)' },
  { value: '+234', label: '+234 (NG)' },
  { value: '+1', label: '+1' },
  { value: '+33', label: '+33' },
];

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
];

const TIMEZONES = [
  { value: 'Africa/Douala', label: 'Africa / Douala' },
  { value: 'Africa/Lagos', label: 'Africa / Lagos' },
  { value: 'UTC', label: 'UTC' },
];

function GlobeIcon() {
  return (
    <svg className="my-account__control-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function LangIcon() {
  return (
    <svg className="my-account__control-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" aria-hidden>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function VerifiedIcon() {
  return (
    <svg className="my-account__status-icon my-account__status-icon--ok" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="my-account__status-icon my-account__status-icon--warn" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10.3 3.6L1.7 18.4A2 2 0 003.4 21h17.2a2 2 0 001.7-2.6L13.7 3.6a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

const emptyForm = () => ({
  firstName: '',
  lastName: '',
  email: '',
  phoneCountryCode: '+237',
  phone: '',
  language: 'en',
  timezone: 'Africa/Douala',
  businessName: '',
  businessAddress: '',
  whatsappNumber: '',
  accountStatus: undefined,
});

export default function MyAccountPage() {
  const axiosPrivate = useAxiosPrivate();
  const { auth, setAuth } = useAuth();
  const { businessCities, isValidBusinessCity } = useBusinessCities();
  const [form, setForm] = useState(emptyForm);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    setLoading(true);
    try {
      const userId = auth?.userId || getUserIdFromAccessToken(getAccessToken());
      if (!userId) {
        setLoadError('Missing account id. Please sign in again.');
        setForm(emptyForm());
        return;
      }
      const raw = await fetchOwnProfile(axiosPrivate, userId);
      const profile = parseMeProfile(raw);
      if (!profile) {
        setLoadError('Could not load profile.');
        setForm(emptyForm());
        return;
      }
      setForm({
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        phoneCountryCode: profile.phoneCountryCode,
        phone: profile.phone,
        language: profile.language,
        timezone: TIMEZONES.some((t) => t.value === profile.timezone) ? profile.timezone : 'Africa/Douala',
        businessName: profile.businessName,
        businessAddress: coerceBusinessLocation(profile.businessAddress, businessCities) || '',
        whatsappNumber: profile.whatsappNumber,
        accountStatus: profile.accountStatus,
      });
      setAuth((prev) => ({
        ...prev,
        accountStatus: profile.accountStatus ?? prev.accountStatus,
        whatsappNumber: profile.whatsappNumber || prev.whatsappNumber,
        businessAddress: profile.businessAddress || prev.businessAddress,
      }));
    } catch (err) {
      setLoadError(err?.response?.data?.message || err?.message || 'Failed to load profile.');
      setForm(emptyForm());
    } finally {
      setLoading(false);
    }
  }, [auth?.userId, axiosPrivate, setAuth, businessCities]);

  useEffect(() => {
    load();
  }, [load]);

  const displayName = useMemo(() => {
    const combined = `${form.firstName} ${form.lastName}`.trim();
    return combined || auth?.user || 'Your account';
  }, [form.firstName, form.lastName, auth?.user]);

  const isVerified = String(form.accountStatus || '').toLowerCase() === 'active';

  const onChange = (field) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [field]: v }));
    setSaveOk(false);
    setSaveError('');
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaveError('');
    setSaveOk(false);
    setSaving(true);
    const name = `${form.firstName} ${form.lastName}`.trim();
    const userId = auth?.userId || getUserIdFromAccessToken(getAccessToken());
    if (!userId) {
      setSaveError('Missing account id. Please sign in again.');
      setSaving(false);
      return;
    }
    const national = String(form.phone).replace(/\s/g, '');
    const tel = national.startsWith('+') ? national : `${form.phoneCountryCode}${national}`;
    if (!isValidBusinessCity(form.businessAddress)) {
      setSaveError('Please select a valid business city from the dropdown.');
      setSaving(false);
      return;
    }
    try {
      const raw = await patchAuthProfile(axiosPrivate, userId, {
        name: name || auth?.user,
        businessName: form.businessName,
        businessAddress: form.businessAddress.trim(),
        tel,
        whatsappNumber: String(form.whatsappNumber).replace(/\s/g, ''),
      });
      const profile = parseMeProfile(raw);
      if (profile) {
        setForm((f) => ({
          ...f,
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phoneCountryCode: profile.phoneCountryCode,
          phone: profile.phone,
          language: profile.language,
          timezone: TIMEZONES.some((t) => t.value === profile.timezone) ? profile.timezone : f.timezone,
          businessName: profile.businessName,
          businessAddress: profile.businessAddress,
          whatsappNumber: profile.whatsappNumber,
          accountStatus: profile.accountStatus ?? f.accountStatus,
        }));
        setAuth((prev) => ({
          ...prev,
          accountStatus: profile.accountStatus ?? prev.accountStatus,
          whatsappNumber: profile.whatsappNumber || prev.whatsappNumber,
          businessAddress: profile.businessAddress ?? prev.businessAddress,
        }));
      }
      setSaveOk(true);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        (err?.response?.status === 404
          ? 'Saving profile is not available on the server yet.'
          : null) ||
        err?.message ||
        'Could not save changes.';
      setSaveError(typeof msg === 'string' ? msg : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="my-account">
      <div className="my-account__inner">
        <div className="my-account__toolbar">
          <Link to="/" className="my-account__back">
            ← Back to catalog
          </Link>
        </div>

        {loading ? (
          <p className="my-account__loading">Loading your profile…</p>
        ) : loadError ? (
          <div className="my-account__alert my-account__alert--error" role="alert">
            {loadError}
            <button type="button" className="my-account__retry" onClick={load}>
              Retry
            </button>
          </div>
        ) : (
          <div className="my-account__card">
            <header className="my-account__head">
              <div className="my-account__title-block">
                <h1 className="my-account__title">Personal information</h1>
                <p className="my-account__subtitle">Edit your personal information.</p>
              </div>
              <div className="my-account__identity">
                <h2 className="my-account__name">{displayName}</h2>
                <div className={`my-account__status ${isVerified ? 'my-account__status--ok' : 'my-account__status--pending'}`}>
                  {isVerified ? <VerifiedIcon /> : <WarningIcon />}
                  <span>{isVerified ? 'Verified account' : 'Pending verification'}</span>
                </div>
              </div>
            </header>

            <form className="my-account__form" onSubmit={onSubmit} noValidate>
              <div className="my-account__grid my-account__grid--2">
                <label className="my-account__field">
                  <span className="my-account__label">
                    First name <abbr title="required">*</abbr>
                  </span>
                  <input
                    className="my-account__input"
                    value={form.firstName}
                    onChange={onChange('firstName')}
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className="my-account__field">
                  <span className="my-account__label">
                    Last name <abbr title="required">*</abbr>
                  </span>
                  <input
                    className="my-account__input"
                    value={form.lastName}
                    onChange={onChange('lastName')}
                    autoComplete="family-name"
                    required
                  />
                </label>
              </div>

              <label className="my-account__field">
                <span className="my-account__label">
                  Email <abbr title="required">*</abbr>
                </span>
                <input
                  className="my-account__input"
                  type="email"
                  value={form.email}
                  onChange={onChange('email')}
                  autoComplete="email"
                  required
                />
              </label>

              <div className="my-account__field">
                <span className="my-account__label">Phone number</span>
                <div className="my-account__phone-row">
                  <select
                    className="my-account__input my-account__input--code"
                    value={form.phoneCountryCode}
                    onChange={onChange('phoneCountryCode')}
                    aria-label="Country calling code"
                  >
                    {PHONE_CODES.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className="my-account__input my-account__input--phone"
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    onChange={onChange('phone')}
                    autoComplete="tel-national"
                    placeholder="e.g. 6 70 00 00 00"
                  />
                </div>
              </div>

              <div className="my-account__grid my-account__grid--2">
                <div className="my-account__field my-account__field--select">
                  <span className="my-account__label">Language</span>
                  <div className="my-account__select-wrap">
                    <span className="my-account__select-icon" aria-hidden>
                      <LangIcon />
                    </span>
                    <select className="my-account__input my-account__select" value={form.language} onChange={onChange('language')}>
                      {LANGUAGES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="my-account__field my-account__field--select">
                  <span className="my-account__label">Time zone</span>
                  <div className="my-account__select-wrap">
                    <span className="my-account__select-icon" aria-hidden>
                      <GlobeIcon />
                    </span>
                    <select className="my-account__input my-account__select" value={form.timezone} onChange={onChange('timezone')}>
                      {TIMEZONES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <h3 className="my-account__section-label">Business</h3>
              <div className="my-account__grid my-account__grid--1">
                <label className="my-account__field">
                  <span className="my-account__label">Business name</span>
                  <input
                    className="my-account__input"
                    value={form.businessName}
                    onChange={onChange('businessName')}
                    autoComplete="organization"
                  />
                </label>
                <label className="my-account__field">
                  <span className="my-account__label">Business city</span>
                  <BusinessLocationSelect
                    className="my-account__input my-account__select my-account__select--location"
                    name="businessAddress"
                    value={form.businessAddress}
                    onChange={onChange('businessAddress')}
                    mode="required"
                  />
                </label>
                <label className="my-account__field">
                  <span className="my-account__label">WhatsApp</span>
                  <input
                    className="my-account__input"
                    type="tel"
                    value={form.whatsappNumber}
                    onChange={onChange('whatsappNumber')}
                    autoComplete="tel"
                  />
                </label>
              </div>

              {saveError ? (
                <p className="my-account__inline-msg my-account__inline-msg--error" role="alert">
                  {saveError}
                </p>
              ) : null}
              {saveOk ? (
                <p className="my-account__inline-msg my-account__inline-msg--ok" role="status">
                  Changes saved.
                </p>
              ) : null}

              <div className="my-account__actions">
                <button type="submit" className="my-account__submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
