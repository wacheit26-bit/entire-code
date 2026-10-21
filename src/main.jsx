import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthProvider';
import ErrorBoundary from './components/ErrorBoundary';
import PersistLogin from './components/PersistLogin';
import App from './App.jsx';
import './index.css';
import { initApiFailover } from './utils/apiBaseUrl';

initApiFailover().catch(() => {});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PersistLogin>
            <App />
          </PersistLogin>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
