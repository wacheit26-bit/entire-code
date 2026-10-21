import { Link, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import { useNotificationInboxOptional } from '../context/NotificationInboxContext';
import useAuth from '../hooks/useAuth';
import './Header.css';

function SearchIcon() {
  return (
    <svg className="header-search__icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg className="header-cart__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 6h15l-1.5 9h-12z" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M6 6 5 3H2" />
    </svg>
  );
}

export default function Header({
  cartCount = 0,
  searchQuery = '',
  onSearchChange,
  onSignOut,
  showAdminDashboardLink = false,
  showSalesDashboardLink = false,
}) {
  const location = useLocation();
  const inbox = useNotificationInboxOptional();
  const unread = inbox?.unreadCount ?? 0;
  const { auth, isLoggingOut } = useAuth();
  const showBackToAdmin = showAdminDashboardLink && !location.pathname.startsWith('/admin');
  const showBackToSales = showSalesDashboardLink && !location.pathname.startsWith('/sales');

  return (
    <header className="header-bar">
      <div className="header-bar__brand">
        <Link to="/" className="header-bar__logo-link">
          <BrandLogo alt="" className="header-bar__logo-img" width={40} height={40} />
       
        </Link>
      </div>

      <div className="header-bar__search">
        <label htmlFor="global-product-search" className="visually-hidden">
          Search products
        </label>
        <div className="header-search">
          <SearchIcon />
          <input
            id="global-product-search"
            type="search"
            className="header-search__input"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>

      <nav className="header-bar__nav" aria-label="Account">
        <span
          className="header-bar__nav-item header-bar__account header-bar__account--disabled"
          aria-disabled="true"
          title="My account is unavailable"
        >
          My Account
          {auth?.user ? <span className="header-bar__account-sub">{auth.user}</span> : null}
        </span>
        <Link className="header-bar__nav-item header-bar__notif-link" to="/notifications">
          Notifications
          {unread > 0 ? <span className="header-notif-badge">{unread > 99 ? '99+' : unread}</span> : null}
        </Link>
        {showBackToAdmin ? (
          <Link to="/admin" className="header-bar__nav-item header-bar__admin-dashboard-nav-link">
            Admin dashboard
          </Link>
        ) : null}
        {showBackToSales ? (
          <Link to="/sales" className="header-bar__nav-item header-bar__admin-dashboard-nav-link">
            Sales dashboard
          </Link>
        ) : null}
        {onSignOut ? (
          <button
            type="button"
            className="header-bar__nav-item header-bar__signout"
            onClick={() => onSignOut()}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
          >
            {isLoggingOut ? (
              <>
                <span className="header-bar__signout-spinner" aria-hidden />
                Signing out…
              </>
            ) : (
              'Sign Out'
            )}
          </button>
        ) : null}
        <Link
          className="header-bar__cart"
          to="/cart"
          aria-label={`Shopping cart, ${cartCount} ${cartCount === 1 ? 'product' : 'products'}`}
        >
          <CartIcon />
          {cartCount > 0 ? <span className="header-cart-count">{cartCount > 99 ? '99+' : cartCount}</span> : null}
        </Link>
      </nav>
    </header>
  );
}
