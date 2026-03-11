import './Header.css';
import logoImg from '../assets/logo.png';

export default function Header({ cartCount = 0, searchValue = '', onSearchChange }) {
  const showSearch = typeof onSearchChange === 'function';
  return (
    <header className="header">
      <div className="header-inner">
        <a href="/" className="logo" aria-label="Wache">
          <img src={logoImg} alt="Wache" className="logo-img" />
        </a>
        {showSearch && (
          <div className="header-search">
            <span className="header-search-icon" aria-hidden>🔍</span>
            <input
              type="search"
              className="header-search-input"
              placeholder="Search List"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search list"
            />
          </div>
        )}
        <nav className="nav">
          <a href="#account" className="nav-account" aria-label="My Account">
            <span className="nav-icon" aria-hidden>👤</span>
            <span className="nav-label">My Account</span>
          </a>
          <a href="#help" className="nav-help" aria-label="Help">
            <span className="nav-label">Help</span>
          </a>
          <a href="#signout" className="nav-signout">
            <span className="nav-label">Sign Out</span>
          </a>
          <a href="#cart" className="cart-link" aria-label={`Cart, ${cartCount} items`}>
            <span className="cart-icon" aria-hidden>🛒</span>
            {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
          </a>
        </nav>
      </div>
    </header>
  );
}
