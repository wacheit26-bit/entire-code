import { useState, useMemo } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import ProductList from './components/ProductList';
import Footer from './components/Footer';
import { mockProducts } from './data/products';
import './App.css';

function filterProducts(products, filterText, filters) {
  let result = [...products];

  // Text filter (name, specs)
  if (filterText.trim()) {
    const q = filterText.toLowerCase().trim();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.color?.toLowerCase().includes(q) ||
        p.capacity?.toLowerCase().includes(q) ||
        p.condition?.toLowerCase().includes(q) ||
        p.carrier?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.imei?.toLowerCase().includes(q)
    );
  }

  // Category filters: include product if it matches any selected value in each active filter
  const filterKeys = ['manufacturer', 'model', 'capacity', 'color', 'condition', 'carrier'];
  for (const key of filterKeys) {
    const selected = filters[key];
    if (selected?.length) {
      result = result.filter((p) => {
        const val = p[key];
        return val && selected.includes(val);
      });
    }
  }

  return result;
}

function sortProducts(products, sortBy) {
  const sorted = [...products];
  switch (sortBy) {
    case 'priceAsc':
      sorted.sort((a, b) => Number(a.price) - Number(b.price));
      break;
    case 'priceDesc':
      sorted.sort((a, b) => Number(b.price) - Number(a.price));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'dateAdded':
    default:
      sorted.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
      break;
  }
  return sorted;
}

export default function App() {
  const [cartCount, setCartCount] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [sortBy, setSortBy] = useState('dateAdded');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filtered = useMemo(
    () => filterProducts(mockProducts, filterText, filters),
    [filterText, filters]
  );
  const sorted = useMemo(() => sortProducts(filtered, sortBy), [filtered, sortBy]);
  const totalCount = sorted.length;
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return sorted.slice(start, start + perPage);
  }, [sorted, page, perPage]);

  // Reset to page 1 when filters or perPage change
  const handlePerPageChange = (n) => {
    setPerPage(n);
    setPage(1);
  };
  const handleSortChange = (value) => {
    setSortBy(value);
    setPage(1);
  };

  const handleAddToCart = (productId, qty) => {
    setCartCount((c) => c + (qty || 1));
  };

  const handleAddToWatchlist = () => {
    // Placeholder
  };

  const handleAddNewRequest = () => {
    // Placeholder
  };

  return (
    <div className="app">
      <Header
          cartCount={cartCount}
          searchValue={filterText}
          onSearchChange={setFilterText}
        />
      <div className="app-layout">
        <Sidebar
          filterText={filterText}
          onFilterTextChange={setFilterText}
          filters={filters}
          onFilterChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
        />
        <main className="app-main">
          <div className="mobile-filters-wrapper">
            <button
              type="button"
              className="mobile-filters-trigger"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              aria-expanded={mobileFiltersOpen}
              aria-controls="mobile-filters-dropdown"
              id="mobile-filters-button"
            >
              <span>Filters</span>
              <span aria-hidden>{mobileFiltersOpen ? '▼' : '▶'}</span>
            </button>
            {mobileFiltersOpen && (
              <div
                id="mobile-filters-dropdown"
                className="mobile-filters-dropdown"
                role="region"
                aria-label="Filter options"
              >
                <Sidebar
                  filterText={filterText}
                  onFilterTextChange={setFilterText}
                  filters={filters}
                  onFilterChange={(next) => {
                    setFilters(next);
                    setPage(1);
                  }}
                />
              </div>
            )}
          </div>
          <ProductList
            products={paginated}
            page={page}
            perPage={perPage}
            totalCount={totalCount}
            sortBy={sortBy}
            onPageChange={setPage}
            onPerPageChange={handlePerPageChange}
            onSortChange={handleSortChange}
            onAddToCart={handleAddToCart}
            onAddToWatchlist={handleAddToWatchlist}
            onAddNewRequest={handleAddNewRequest}
          />
        </main>
      </div>
      <Footer />
    </div>
  );
}
