import { lazy, Suspense, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import AuthenticatedApp from './pages/AuthenticatedApp';
import useAuth from './hooks/useAuth';
import { getRole } from './api/session';
import { NotificationInboxProvider } from './context/NotificationInboxContext';
import './App.css';

const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));

export default function App() {
  const { auth } = useAuth();
  const location = useLocation();
  const role = String(auth?.role || getRole() || 'wholesaler').toLowerCase();
  const isLoggedIn = Boolean(auth?.accessToken);

  if (isLoggedIn && (role === 'wholesaler' || role === 'wholesale' || role === 'admin' || role === 'salesman' || role === 'salesperson' || role === 'sales')) {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  useEffect(() => {
    const root = document.documentElement;
    const useLightWholesaleShell =
      role === 'wholesaler' ||
      role === 'wholesale' ||
      role === 'admin' ||
      role === 'salesman' ||
      role === 'salesperson' ||
      role === 'sales';
    if (isLoggedIn && useLightWholesaleShell) {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [isLoggedIn, role]);

  if (!isLoggedIn) {
    if (location.pathname === '/register') {
      return (
        <Suspense fallback={null}>
          <SignupPage />
        </Suspense>
      );
    }
    if (location.pathname === '/forgot-password') {
      return (
        <Suspense fallback={null}>
          <ForgotPasswordPage />
        </Suspense>
      );
    }
    return <LoginPage />;
  }

  return (
    <NotificationInboxProvider>
      <AuthenticatedApp role={role} />
    </NotificationInboxProvider>
  );
}
