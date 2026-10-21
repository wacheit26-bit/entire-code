import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import { postCompletePasswordReset, postForgotPassword, postVerifyResetCode } from '../api/passwordResetApi';
import './LoginPage.css';
import './ForgotPasswordPage.css';

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

/** @type {1 | 2 | 3} */
const STEP_WHATSAPP = 1;
const STEP_CODE = 2;
const STEP_NEW_PASSWORD = 3;

/** Strip whitespace, parentheses, dashes; preserve a leading "+". */
function cleanPhoneInput(raw) {
  if (raw == null) return '';
  const stripped = String(raw).replace(/[\s\-()]/g, '');
  return stripped.replace(/(?!^\+)\D/g, '');
}

/** Format the number for display in the "code sent to …" line. */
function formatNumberForDisplay(raw) {
  const v = cleanPhoneInput(raw);
  if (!v) return 'your WhatsApp number';
  return v.startsWith('+') ? v : `+${v.startsWith('237') ? '' : '237'}${v.replace(/^237/, '')}`;
}

/**
 * Accept the formats the server understands: 9 local digits, or 12 digits prefixed by 237 / +237 /
 * 00237.
 */
function isValidCmWhatsappNumber(raw) {
  const cleaned = cleanPhoneInput(raw);
  return /^(?:\+237|00237|237)?\d{9}$/.test(cleaned);
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const phoneRef = useRef(null);
  const codeRef = useRef(null);
  const errRef = useRef(null);

  const [step, setStep] = useState(STEP_WHATSAPP);
  const [whatsapp, setWhatsapp] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  useEffect(() => {
    if (step === STEP_CODE) codeRef.current?.focus();
  }, [step]);

  const submitWhatsapp = async (e) => {
    e.preventDefault();
    const number = cleanPhoneInput(whatsapp);
    if (!isValidCmWhatsappNumber(number)) {
      setErrMsg('Enter a valid WhatsApp number (e.g. 677123456 or +237677123456).');
      return;
    }
    setLoading(true);
    setErrMsg('');
    setInfoMsg('');
    try {
      const data = await postForgotPassword(number);
      if (data?.whatsappSent === false) {
        setInfoMsg(
          String(data.message || 'Your account was found, but the server could not send a WhatsApp message. Contact support.'),
        );
      } else {
        setInfoMsg(String(data.message || 'Check WhatsApp for your verification code.'));
      }
      setStep(STEP_CODE);
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message;
      if (status === 404) setErrMsg(msg || 'No account is registered with this WhatsApp number.');
      else if (!err?.response) setErrMsg('Check your Internet connection.');
      else setErrMsg(msg || 'Could not start password reset.');
    } finally {
      setLoading(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '').slice(0, 6);
    if (c.length !== 6) {
      setErrMsg('Enter the 6-digit code from WhatsApp.');
      return;
    }
    setLoading(true);
    setErrMsg('');
    try {
      const data = await postVerifyResetCode(cleanPhoneInput(whatsapp), c);
      const token = data?.resetToken;
      if (!token || typeof token !== 'string') {
        setErrMsg('Invalid response from server. Try again.');
        return;
      }
      setResetToken(token);
      setStep(STEP_NEW_PASSWORD);
      setInfoMsg('Code accepted. Choose a new password.');
    } catch (err) {
      const msg = err?.response?.data?.message;
      setErrMsg(msg || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const submitNewPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setErrMsg('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrMsg('Passwords do not match.');
      return;
    }
    setLoading(true);
    setErrMsg('');
    try {
      await postCompletePasswordReset(cleanPhoneInput(whatsapp), resetToken, newPassword);
      navigate('/', {
        replace: true,
        state: { notice: 'Password updated. You can sign in with your new password.' },
      });
    } catch (err) {
      const msg = err?.response?.data?.message;
      setErrMsg(msg || 'Could not update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card forgot-password-card">
        <section className="login-form-panel">
          <BrandLogo className="login-logo" />
          <h1 className="login-title">Forgot password</h1>
          <p className="forgot-password-lead">
            {step === STEP_WHATSAPP &&
              'Enter the WhatsApp number on your account. We will send a verification code to it.'}
            {step === STEP_CODE && `We sent a code to ${formatNumberForDisplay(whatsapp)} on WhatsApp.`}
            {step === STEP_NEW_PASSWORD && 'Choose a new password for your account.'}
          </p>

          {infoMsg ? (
            <p className="login-notice" role="status">
              {infoMsg}
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

          {step === STEP_WHATSAPP && (
            <form className="login-form" onSubmit={submitWhatsapp} noValidate>
              <label className="login-field">
                <span>WhatsApp number</span>
                <input
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(cleanPhoneInput(e.target.value))}
                  placeholder="677123456 or +237677123456"
                  required
                />
              </label>
              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? 'Sending…' : 'Send code to WhatsApp'}
              </button>
            </form>
          )}

          {step === STEP_CODE && (
            <form className="login-form" onSubmit={submitCode} noValidate>
              <label className="login-field">
                <span>6-digit code</span>
                <input
                  ref={codeRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  required
                />
              </label>
              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? 'Verifying…' : 'Verify code'}
              </button>
              <button
                type="button"
                className="forgot-password-secondary-btn"
                disabled={loading}
                onClick={() => {
                  setStep(STEP_WHATSAPP);
                  setCode('');
                  setErrMsg('');
                  setInfoMsg('');
                }}
              >
                Use a different number
              </button>
            </form>
          )}

          {step === STEP_NEW_PASSWORD && (
            <form className="login-form" onSubmit={submitNewPassword} noValidate>
              <label className="login-field">
                <span>New password</span>
                <div className="login-password-wrap">
                  <input
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPw} />
                  </button>
                </div>
              </label>
              <label className="login-field">
                <span>Confirm password</span>
                <div className="login-password-wrap">
                  <input
                    type={showPw2 ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPw2((v) => !v)}
                    aria-label={showPw2 ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPw2} />
                  </button>
                </div>
              </label>
              <button type="submit" className="login-submit-btn" disabled={loading}>
                {loading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          )}

          <p className="forgot-password-back">
            <Link to="/">Back to sign in</Link>
          </p>
        </section>

        <aside className="login-info-panel">
          <h2 className="login-info-title">Why WhatsApp?</h2>
          <p className="login-info-sub">
            We send a short code straight to the WhatsApp number on your account so only you can set a new
            password. Codes expire after about 15 minutes.
          </p>
        </aside>
      </div>
    </div>
  );
}
