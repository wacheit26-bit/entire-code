import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axiosPublic from '../api/axios';
import useAuth from '../hooks/useAuth';
import { setAccessToken } from '../api/tokenStore';
import { markSession, rolesFromAuthBody, setRole } from '../api/session';
import { normalizeAuthApiBody, pickAccountStatus, pickUserIdFromAuthBody } from '../api/authResponse';
import { describeApiFailure } from '../utils/apiBaseUrl';
import BrandLogo from '../components/BrandLogo';
import './LoginPage.css';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.1 18.1 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const FEATURES = ['Consistent Inventory', 'Accurate Grading', 'Fast Turnaround'];

export default function LoginPage() {
  const { setAuth } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const redirectNotice =
    params.get('notice') || (typeof location.state?.notice === 'string' ? location.state.notice : '');
  const userRef = useRef(null);
  const errRef = useRef(null);

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !password.trim()) {
      setErrMsg('Missing Username or Password');
      errRef.current?.focus();
      return;
    }
    setLoading(true);
    setErrMsg('');
    try {
      const res = await axiosPublic.post('/auth', { name: name.trim(), password });
      const norm = normalizeAuthApiBody(res.data);
      const accessToken = norm.accessToken;
      if (!accessToken) throw new Error('Missing access token');

      setAccessToken(accessToken);
      markSession();
      const { normalizedRoles, primaryRole } = rolesFromAuthBody({ role: norm.role, roles: norm.roles });
      const resolvedRole = String(primaryRole || 'wholesaler').toLowerCase();
      setRole(resolvedRole);

      const userId = pickUserIdFromAuthBody(norm);
      try {
        if (userId) sessionStorage.removeItem(`wache_dismiss_wholesale_pending:${userId}`);
      } catch {
        /* ignore */
      }

      setAuth({
        user: name.trim(),
        userId,
        role: resolvedRole,
        roles: normalizedRoles,
        accessToken,
        accountStatus: pickAccountStatus(norm.user),
        whatsappNumber: String(norm?.user?.whatsappNumber ?? norm?.user?.whatsapp ?? '').trim(),
        businessAddress: String(
          norm?.user?.businessAddress ??
            norm?.user?.business_address ??
            res.data?.user?.businessAddress ??
            '',
        ).trim(),
      });
      navigate(resolvedRole === 'admin' ? '/admin' : resolvedRole === 'salesman' ? '/sales' : '/');
    } catch (err) {
      setErrMsg(describeApiFailure(err));
      errRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <section className="login-form-panel">
          <BrandLogo className="login-logo" priority />
          <h1 className="login-title">Sign in to your account</h1>

          {redirectNotice ? (
            <p className="login-notice" role="status">
              {redirectNotice}
            </p>
          ) : null}

          <p
            ref={errRef}
            className={errMsg ? 'login-error' : 'login-error login-error--offscreen'}
            role={errMsg ? 'alert' : undefined}
            tabIndex={-1}
          >
            {errMsg}
          </p>

          <form className="login-form" onSubmit={submit} noValidate>
            <label className="login-field">
              <span>Name</span>
              <input
                ref={userRef}
                type="text"
                autoComplete="username"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="login-field">
              <span>Password</span>
              <div className="login-password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </label>
            <button type="submit" className="login-submit-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <p className="login-forgot-row">
              <button type="button" className="login-forgot-link" onClick={() => navigate('/forgot-password')}>
                Forgot password?
              </button>
            </p>
          </form>
        </section>

        <aside className="login-info-panel">
          <h2 className="login-info-title">New to Wache?</h2>
          <p className="login-info-sub">
            We provide phones and other devices in bulk to vendors and retailers in Cameroon.
          </p>
          <ul className="login-features">
            {FEATURES.map((label) => (
              <li key={label} className="login-feature-item">
                <span className="login-feature-icon">◈</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="login-create-btn" onClick={() => navigate('/register')}>
            Create Account
          </button>
        </aside>
      </div>
    </div>
  );
}
