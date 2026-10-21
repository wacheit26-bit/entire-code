import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { addProductImages } from '../../api/productsApi';
import { fetchWarehouseProducts } from '../../api/warehouseApi';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import { bulkBatchTravelRoute, productLocationDisplay } from '../../utils/productTravelRoute';
import './WarehouseProductsModal.css';

const MAX_PHOTOS = 5;

function productImageCount(p) {
  return Array.isArray(p?.images) ? p.images.length : 0;
}

function WarehouseProductPhotoCell({ product, axiosPrivate, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const productId = String(product?._id ?? product?.id ?? '').trim();
  const count = productImageCount(product);
  const status = String(product?.shipmentStatus || 'arrived').toLowerCase();
  const canUpload = count < MAX_PHOTOS;

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter((f) => /^image\//.test(f.type));
    if (!files.length || !productId) return;
    setUploading(true);
    setError('');
    try {
      await addProductImages(axiosPrivate, productId, files.slice(0, MAX_PHOTOS - count));
      notifyProductCatalogUpdated();
      await onUploaded?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  if (!productId) return <td>—</td>;

  return (
    <td className="warehouse-products-modal__photos-cell">
      {count > 0 ? (
        <span className="warehouse-products-modal__photo-count">{count} photo{count === 1 ? '' : 's'}</span>
      ) : (
        <span className="warehouse-products-modal__photo-missing">No photos</span>
      )}
      {canUpload ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden-file-input"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="settings-btn warehouse-products-modal__upload-btn"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? 'Uploading…' : count === 0 ? 'Add photos' : 'Add more'}
          </button>
        </>
      ) : null}
      {status === 'travelling' && count === 0 ? (
        <span className="warehouse-products-modal__photo-hint">Upload when stock is received</span>
      ) : null}
      {error ? <span className="warehouse-products-modal__photo-error">{error}</span> : null}
    </td>
  );
}

export default function WarehouseProductsModal({ warehouse, onClose }) {
  const axiosPrivate = useAxiosPrivate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  const warehouseId = String(warehouse?._id ?? warehouse?.id ?? '').trim();
  const warehouseName = warehouse?.name || 'Warehouse';

  const reload = useCallback(async () => {
    if (!warehouseId) return;
    setLoading(true);
    setError('');
    try {
      const result = await fetchWarehouseProducts(axiosPrivate, warehouseId);
      setData(result);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  }, [axiosPrivate, warehouseId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!warehouseId) return null;

  const withoutPhotos = (data?.products || []).filter((p) => productImageCount(p) === 0).length;

  return createPortal(
    <div className="warehouse-products-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="warehouse-products-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="warehouse-products-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="warehouse-products-modal__header">
          <div>
            <h2 id="warehouse-products-title">Products in {warehouseName}</h2>
            {warehouse?.city ? (
              <p className="warehouse-products-modal__subtitle">
                {warehouse.city}
                {warehouse.address ? ` · ${warehouse.address}` : ''}
              </p>
            ) : null}
            <p className="warehouse-products-modal__lead">
              Upload product photos for on-hand stock at this warehouse. In-transit stock must be marked
              received before photos apply. Bulk uploads do not include images.
            </p>
          </div>
          <button type="button" className="warehouse-products-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {loading ? <p className="warehouse-products-modal__status">Loading products…</p> : null}
        {error ? <p className="warehouse-products-modal__error">{error}</p> : null}

        {!loading && !error && data ? (
          <>
            <div className="warehouse-products-modal__summary">
              <span>
                <strong>{data.totalProducts}</strong> product{data.totalProducts === 1 ? '' : 's'}
              </span>
              <span>
                <strong>{data.totalStock}</strong> total units in stock
              </span>
              {withoutPhotos > 0 ? (
                <span className="warehouse-products-modal__summary-warn">
                  <strong>{withoutPhotos}</strong> awaiting photos
                </span>
              ) : null}
            </div>

            {data.products.length === 0 ? (
              <p className="warehouse-products-modal__empty">No products are currently stored at this Warehouse.</p>
            ) : (
              <div className="warehouse-products-modal__table-wrap">
                <table className="warehouse-products-modal__table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Brand</th>
                      <th>Stock</th>
                      <th>Status</th>
                      <th>Location</th>
                      <th>Photos</th>
                      <th>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.products.map((p) => {
                      const id = String(p?._id ?? p?.id ?? '');
                      const status = String(p?.shipmentStatus || 'arrived').toLowerCase();
                      return (
                        <tr key={id || `${p.product_name}-${p.capacity}`}>
                          <td>
                            {p.product_name || '—'}
                            <span className="warehouse-products-modal__meta">
                              {p.capacity || ''} {p.color ? `· ${p.color}` : ''}
                            </span>
                          </td>
                          <td>{p.brand || '—'}</td>
                          <td>{Number(p.stock) || 0}</td>
                          <td>
                            <span className={`warehouses-status-badge warehouses-status-badge--${status}`}>
                              {status}
                            </span>
                            {status === 'travelling' ? (
                              <ProductTravelRoute
                                product={p}
                                className="product-travel-route--block product-travel-route--compact"
                              />
                            ) : null}
                          </td>
                          <td>{productLocationDisplay(p)}</td>
                          <WarehouseProductPhotoCell
                            product={p}
                            axiosPrivate={axiosPrivate}
                            onUploaded={reload}
                          />
                          <td>
                            {p.bulkBatchCode ? (
                              <code className="bulk-batch-code">{p.bulkBatchCode}</code>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : null}

        <footer className="warehouse-products-modal__footer">
          <button type="button" className="settings-btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
