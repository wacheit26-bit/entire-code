import { Link, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth';

export default function Unauthorized() {
  const location = useLocation();
  const { auth } = useAuth();
  const fromPath = location.state?.from?.pathname;

  return (
    <main
      className="unauthorized-page"
      style={{
        minHeight: '50vh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1.25rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 440 }}>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.35rem' }}>Access not allowed</h1>
        <p style={{ margin: '0 0 0.5rem', color: '#64748b', lineHeight: 1.5 }}>
          {auth?.user
            ? `You are signed in as ${auth.user}, but this account cannot open that page.`
            : 'You do not have permission to open this page.'}
        </p>
        {fromPath ? (
          <p style={{ margin: '0 0 1rem', fontSize: '0.9rem', color: '#64748b' }}>
            Requested: <strong>{fromPath}</strong>
          </p>
        ) : null}
        <Link to="/" style={{ fontWeight: 600 }}>
          Return to home
        </Link>
      </div>
    </main>
  );
}
