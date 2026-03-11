import { useMemo } from 'react';
import ProductCard from './ProductCard';
import './ProductList.css';

export default function ProductList({
  products,
  page,
  perPage,
  totalCount,
  sortBy,
  onPageChange,
  onPerPageChange,
  onSortChange,
  onAddToCart,
  onAddToWatchlist,
  onAddNewRequest,
}) {
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalCount);
  const totalPages = Math.ceil(totalCount / perPage) || 1;

  const paginationRange = useMemo(() => {
    const delta = 2;
    const range = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
      range.push(i);
    }
    return range;
  }, [page, totalPages]);

  return (
    <div className="product-list">
      <div className="product-list-header">
        <h1 className="product-list-title">Stock List</h1>
        <div className="product-list-toolbar">
          <button type="button" className="btn-add-request" onClick={onAddNewRequest}>
            Add new request
          </button>
          <select
            value={perPage}
            onChange={(e) => onPerPageChange(Number(e.target.value))}
            aria-label="Items per page"
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                Display {n} items per page
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort by"
          >
            <option value="dateAdded">Sort by Date Added</option>
            <option value="priceAsc">Price: Low to High</option>
            <option value="priceDesc">Price: High to Low</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      <p className="product-list-meta">
        Showing {start}–{end} of {totalCount} results
      </p>

      <ul className="product-list-grid">
        {products.map((product) => (
          <li key={product.id}>
            <ProductCard
              product={product}
              onAddToCart={onAddToCart}
              onAddToWatchlist={onAddToWatchlist}
            />
          </li>
        ))}
      </ul>

      {totalCount === 0 && (
        <p className="product-list-empty">No products match your filters.</p>
      )}

      {totalCount > 0 && (
        <>
          <nav className="pagination" aria-label="Pagination">
            <button
              type="button"
              className="pagination-arrow"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              aria-label="Previous page"
            >
              ‹
            </button>
            <ul className="pagination-pages">
              {page > 2 && totalPages > 5 && (
                <li>
                  <button type="button" onClick={() => onPageChange(1)} aria-label="Page 1">1</button>
                </li>
              )}
              {page > 3 && totalPages > 5 && <li className="pagination-ellipsis">…</li>}
              {paginationRange.map((p) => (
                <li key={p}>
                  <button
                    type="button"
                    className={p === page ? 'current' : ''}
                    onClick={() => onPageChange(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                </li>
              ))}
              {page < totalPages - 2 && totalPages > 5 && <li className="pagination-ellipsis">…</li>}
              {page < totalPages - 1 && totalPages > 5 && (
                <li>
                  <button type="button" onClick={() => onPageChange(totalPages)} aria-label={`Page ${totalPages}`}>{totalPages}</button>
                </li>
              )}
            </ul>
            <button
              type="button"
              className="pagination-arrow"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              aria-label="Next page"
            >
              ›
            </button>
          </nav>
          <p className="product-list-entries">
            Showing {start} to {end} of {totalCount.toLocaleString()} entries
          </p>
        </>
      )}
    </div>
  );
}
