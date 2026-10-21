// SignupPage.jsx - Updated without brand and phoneLocation fields
import { useEffect, useRef, useState } from 'react';
import { AlertDialog } from '../components/AppDialog';
import { useNavigate } from 'react-router-dom';
import axiosPublic from '../api/axios';
import { postRegisterUser } from '../api/registerApi';
import BrandLogo from '../components/BrandLogo';
import BusinessLocationSelect from '../components/BusinessLocationSelect';
import useBusinessCities from '../hooks/useBusinessCities';
import './SignupPage.css';

function EyeIcon({ open }) {
  if (open) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5 19 1 12 1 12a18.1 18.1 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const BENEFITS = [
  'Trusted B2B sourcing',
  'Competitive vendor tiers',
  'Account review within 24–48h'
];

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

export default function SignupPage() {
  const navigate = useNavigate();
  const { isValidBusinessCity } = useBusinessCities();
  const firstFieldRef = useRef(null);
  const errRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    businessAddress: '',
    email: '',
    tel: '',
    whatsappNumber: '',
    password: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const n = formData.name.trim();
    const bn = formData.businessName.trim();
    const ba = formData.businessAddress.trim();
    const t = normalizeCmPhone(formData.tel);
    const wa = normalizeCmPhone(formData.whatsappNumber);

    if (!n || n.length < 2) {
      setErrMsg('Name must be at least 2 characters.');
      errRef.current?.focus();
      return;
    }
    if (!bn || bn.length < 2) {
      setErrMsg('Business name must be at least 2 characters.');
      errRef.current?.focus();
      return;
    }
    if (!isValidBusinessCity(ba)) {
      setErrMsg('Please select a valid business city from the dropdown.');
      errRef.current?.focus();
      return;
    }
    if (!isValidEmail(formData.email) && formData.email.trim() !== '') {
      setErrMsg('Please enter a valid email address, or leave it blank.');
      errRef.current?.focus();
      return;
    }
    if (!isValidCmPhone(t)) {
      setErrMsg('Enter a valid phone: 9 digits (e.g. 677184257 or +237677184257).');
      errRef.current?.focus();
      return;
    }
    if (!isValidCmPhone(wa)) {
      setErrMsg('Enter a valid WhatsApp number: 9 digits (e.g. 677184257 or +237677184257).');
      errRef.current?.focus();
      return;
    }
    if (!formData.password || formData.password.length < 8) {
      setErrMsg('Password must be at least 8 characters.');
      errRef.current?.focus();
      return;
    }

    setLoading(true);
    setErrMsg('');
    try {
      const body = {
        name: n,
        businessName: bn,
        businessAddress: ba,
        tel: t,
        whatsappNumber: wa,
        password: formData.password,
        role: 'wholesaler',
      };
      
      const em = formData.email.trim().toLowerCase();
      if (em) body.email = em;

      await postRegisterUser(axiosPublic, body);
      setSuccessDialogOpen(true);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Registration failed. Please try again.';
      setErrMsg(typeof msg === 'string' ? msg : 'Registration failed.');
      errRef.current?.focus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container">
      <AlertDialog
        open={successDialogOpen}
        title="Account created"
        message="Your account was created and is pending approval. An administrator will review it before you can sign in."
        confirmLabel="Continue to sign in"
        onClose={() => {
          setSuccessDialogOpen(false);
          navigate('/login');
        }}
      />
      <div className="signup-wrapper">
        {/* Left Panel - Form */}
        <div className="signup-form-panel">
          <div className="signup-header">
            <BrandLogo className="signup-logo" />
            <h1 className="signup-title">Create vendor account</h1>
            <p className="signup-description">
              Tell us about your business. We'll review and activate your access shortly.
            </p>
          </div>

          <div
            ref={errRef}
            className={`signup-error ${errMsg ? 'signup-error--visible' : ''}`}
            role={errMsg ? 'alert' : undefined}
            tabIndex={-1}
          >
            {errMsg}
          </div>

          <form className="signup-form" onSubmit={submit} noValidate>
            {/* Row 1: Full Name & Business Name */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Full name <span className="required">*</span>
                </label>
                <input
                  ref={firstFieldRef}
                  type="text"
                  name="name"
                  className="form-input"
                  autoComplete="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Enter your full name"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Business name <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="businessName"
                  className="form-input"
                  autoComplete="organization"
                  value={formData.businessName}
                  onChange={handleChange}
                  required
                  placeholder="Enter your business name"
                />
              </div>
            </div>

            {/* Row 2: Business Address & Email */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Business city <span className="required">*</span>
                </label>
                <BusinessLocationSelect
                  name="businessAddress"
                  className="form-input form-select"
                  value={formData.businessAddress}
                  onChange={handleChange}
                  mode="required"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Email <span className="optional">(optional)</span>
                </label>
                <input
                  type="email"
                  name="email"
                  className="form-input"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {/* Row 3: Phone & WhatsApp */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Phone number <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  name="tel"
                  className="form-input"
                  autoComplete="tel"
                  inputMode="tel"
                  value={formData.tel}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 677184257 or +237677184257"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  WhatsApp number <span className="required">*</span>
                </label>
                <input
                  type="tel"
                  name="whatsappNumber"
                  className="form-input"
                  autoComplete="tel"
                  inputMode="tel"
                  value={formData.whatsappNumber}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 677184257 or +237677184257"
                />
              </div>
            </div>

            {/* Row 4: Password */}
            <div className="form-row">
              <div className="form-group form-group--full">
                <label className="form-label">
                  Password <span className="required">*</span>
                </label>
                <div className="password-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    className="form-input password-input"
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    minLength={8}
                    placeholder="Create a strong password (min. 8 characters)"
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
                <p className="form-hint">Must be at least 8 characters</p>
              </div>
            </div>

            {/* Submit Button */}
            <button type="submit" className="signup-submit" disabled={loading}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>
        </div>

        {/* Right Panel - Benefits & Info */}
        <div className="signup-info-panel">
          <div className="info-content">
            <h2 className="info-title">Why join Wache?</h2>
            <p className="info-description">
              Partner with a focused electronics vendor platform built for resellers who need reliability, clarity,
              and steady supply in Cameroon.
            </p>
            
            <ul className="benefits-list">
              {BENEFITS.map((benefit, index) => (
                <li key={index} className="benefit-item">
                  <div className="benefit-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="info-footer">
              <p className="info-note">Already have an account?</p>
              <button type="button" className="signin-btn" onClick={() => navigate('/login')}>
                Sign in to your account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}