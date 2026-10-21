import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import useInventoryRowExpansion from '../../hooks/useInventoryRowExpansion';
import { warehouseId } from '../../api/warehouseApi';
import { fetchAllGeneralInventoryProducts, submitGeneralInventoryRequest } from '../../api/salesShopApi';
import { AppModal } from '../AppDialog';
import ProductTravelRoute from '../shared/ProductTravelRoute';
import { isProductTravelling, productLocationDisplay } from '../../utils/productTravelRoute';
import {
  filterMergedInventory,
  formatInventoryCapacities,
  inventoryRowKey,
  mergeInventoryProducts,
  pickInventoryCapacityVariant,
  pickInventoryLocation,
} from '../../utils/mergeInventoryProducts';
import InventoryFilters from './InventoryFilters';
import InventoryProductNameCell from '../admin/InventoryProductNameCell';
import MoneyXaf from '../MoneyXaf';
import '../admin/InventoryPanel.css';
import '../shared/ProductTravelRoute.css';
import './InventoryFilters.css';
import './SalesGeneralInventory.css';

function renderPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return <MoneyXaf value={n} />;
}

function productWarehouseLabel(product) {
  const wh = product?.currentWarehouse;
  if (!wh || typeof wh !== 'object') return '—';
  const name = wh.name || 'Warehouse';
  const city = wh.city ? ` (${wh.city})` : '';
  return `${name}${city}`;
}

function productWarehouseId(product) {
  return warehouseId(product?.currentWarehouse) || warehouseId(product);
}

export default function SalesGeneralInventory({ selectedShop }) {
  const client = useAxiosPrivate();
  const shopId = warehouseId(selectedShop);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [capacityFilter, setCapacityFilter] = useState('');
  const {
    inlineStoragePickerKey,
    expandedStorageSelection,
    handleProductSelect,
    handleStorageSelect,
  } = useInventoryRowExpansion();

  const [requestProduct, setRequestProduct] = useState(null);
  const [requestQty, setRequestQty] = useState(1);
  const [requestNotes, setRequestNotes] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');

  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError('');
    try {
      const data = await fetchAllGeneralInventoryProducts(client);
      setProducts(data.products);
    } catch (e) {
      setProductsError(e?.response?.data?.message || e?.message || 'Failed to load general inventory.');
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadProducts().catch(() => {});
  }, [loadProducts]);

  const merged = useMemo(() => mergeInventoryProducts(products), [products]);

  const visible = useMemo(
    () => filterMergedInventory(merged, { nameQuery, capacity: capacityFilter }),
    [merged, nameQuery, capacityFilter],
  );

  const openRequest = (row) => {
    const { product: p } = pickInventoryLocation(row, '');
    setRequestProduct(p || row);
    setRequestQty(Math.max(1, Math.min(Number(row?.stock) || Number(p?.stock) || 1, 99)));
    setRequestNotes('');
    setRequestError('');
    setRequestSuccess('');
  };

  const closeRequest = () => {
    if (requestSubmitting) return;
    setRequestProduct(null);
    setRequestError('');
  };

  const submitRequest = async (e) => {
    e.preventDefault();
    const sourceWarehouseId = productWarehouseId(requestProduct);
    if (!shopId || !sourceWarehouseId || !requestProduct) {
      setRequestError('Select your shop in the sidebar and a product with a warehouse location.');
      return;
    }
    setRequestSubmitting(true);
    setRequestError('');
    setRequestSuccess('');
    try {
      await submitGeneralInventoryRequest(client, {
        shopId,
        warehouseId: sourceWarehouseId,
        productName: requestProduct.product_name || requestProduct.productName || 'Product',
        brand: requestProduct.brand || '',
        capacity: requestProduct.capacity || '',
        color: requestProduct.color || '',
        quantity: Math.max(1, Number(requestQty) || 1),
        notes: requestNotes.trim(),
      });
      setRequestSuccess('Stock request submitted.');
      setRequestProduct(null);
    } catch (err) {
      setRequestError(err?.response?.data?.message || err?.message || 'Could not submit request.');
    } finally {
      setRequestSubmitting(false);
    }
  };

  if (!shopId) return null;

  return (
    <div className="sales-general-inv">
      <section className="wh-panel sales-shop-dash__panel sales-general-inv__catalog">
        <div className="sales-general-inv__catalog-head">
          <div>
            <h3>General inventory</h3>
            <p className="sales-general-inv__picker-lead">
              All available products in regional inventory (USA excluded), grouped by product name.
              Request stock for <strong>{selectedShop?.name || 'your shop'}</strong> — you cannot sell
              these directly until they arrive at your shop.
            </p>
          </div>
          <button type="button" className="sales-refresh-btn" onClick={() => loadProducts()}>
            Refresh
          </button>
        </div>

        {requestSuccess ? <p className="sales-alert sales-alert--ok">{requestSuccess}</p> : null}
        {productsLoading ? <p className="sales-hint">Loading general inventory…</p> : null}
        {productsError ? <p className="sales-alert sales-alert--err">{productsError}</p> : null}

        {!productsLoading && merged.length > 0 ? (
          <InventoryFilters
            rows={merged}
            nameQuery={nameQuery}
            capacity={capacityFilter}
            onNameQueryChange={setNameQuery}
            onCapacityChange={setCapacityFilter}
            idPrefix="general-inv"
          />
        ) : null}

        {!productsLoading && !productsError && visible.length === 0 ? (
          <p className="sales-hint">No products in general inventory right now.</p>
        ) : null}

        {!productsLoading && visible.length > 0 ? (
          <div className="sales-table-wrap">
            <table className="sales-table sales-general-inv__table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Storage</th>
                  <th>Warehouse</th>
                  <th>Status</th>
                  <th>Route</th>
                  <th>Stock</th>
                  <th className="fit-numeric-cell">Price</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const rowKey = inventoryRowKey(row);
                  const { product: p } = pickInventoryLocation(row, '');
                  const stock = Math.max(0, Number(row.stock) || 0);
                  const price = Number(p?.price) > 0 ? p.price : row.price;
                  const isRowExpanded = expandedStorageSelection.rowKey === rowKey;
                  const expandedVariant = isRowExpanded
                    ? pickInventoryCapacityVariant(row, expandedStorageSelection.capacity)
                    : null;
                  const variantProduct =
                    expandedVariant?.row?.locations?.[0]?.product ||
                    expandedVariant?.row ||
                    p ||
                    row;
                  const variantStock = Math.max(0, Number(expandedVariant?.stock) || 0);
                  const variantPrice =
                    Number(variantProduct?.price) > 0 ? variantProduct.price : price;

                  return (
                    <Fragment key={rowKey}>
                      <tr className={isRowExpanded ? 'wh-inventory-row--expanded' : ''}>
                        <td>
                          <InventoryProductNameCell
                            row={row}
                            productName={row.product_name}
                            inlineStoragePickerKey={inlineStoragePickerKey}
                            expandedStorageSelection={expandedStorageSelection}
                            onProductSelect={handleProductSelect}
                            onStorageSelect={handleStorageSelect}
                            getStorageCount={(item, cap) =>
                              pickInventoryCapacityVariant(item, cap).stock
                            }
                          />
                          {!isRowExpanded && p?.color ? (
                            <span className="sales-general-inv__meta">{p.color}</span>
                          ) : null}
                        </td>
                        <td>{row.brand || '—'}</td>
                        <td>{formatInventoryCapacities(row)}</td>
                        <td>{productWarehouseLabel(p)}</td>
                        <td>{p?.shipmentStatus || '—'}</td>
                        <td>
                          {isProductTravelling(p) ? (
                            <ProductTravelRoute product={p} />
                          ) : (
                            productLocationDisplay(p)
                          )}
                        </td>
                        <td>{stock}</td>
                        <td className="fit-numeric-cell">{renderPrice(price)}</td>
                        <td>
                          <button
                            type="button"
                            className="sales-general-inv__request-btn"
                            onClick={() => openRequest(row)}
                            disabled={stock <= 0}
                          >
                            Request
                          </button>
                        </td>
                      </tr>
                      {isRowExpanded ? (
                        <tr className="wh-inventory-unit-row">
                          <td className="wh-inventory-unit-row__product">
                            <span className="wh-inventory-unit-row__marker" aria-hidden>
                              ↳
                            </span>
                            {expandedStorageSelection.capacity || 'Variant'}
                          </td>
                          <td>{row.brand || '—'}</td>
                          <td>{expandedStorageSelection.capacity || '—'}</td>
                          <td>{productWarehouseLabel(variantProduct)}</td>
                          <td>{variantProduct?.shipmentStatus || '—'}</td>
                          <td>
                            {isProductTravelling(variantProduct) ? (
                              <ProductTravelRoute product={variantProduct} />
                            ) : (
                              productLocationDisplay(variantProduct)
                            )}
                          </td>
                          <td>{variantStock}</td>
                          <td className="fit-numeric-cell">{renderPrice(variantPrice)}</td>
                          <td>
                            <button
                              type="button"
                              className="sales-general-inv__request-btn"
                              onClick={() => openRequest(expandedVariant?.row || row)}
                              disabled={variantStock <= 0}
                            >
                              Request
                            </button>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <AppModal
        open={Boolean(requestProduct)}
        title="Request stock"
        onClose={closeRequest}
        footer={
          <>
            <button type="button" className="app-dialog__btn" onClick={closeRequest} disabled={requestSubmitting}>
              Cancel
            </button>
            <button
              type="submit"
              form="sales-general-inv-request-form"
              className="app-dialog__btn app-dialog__btn--primary"
              disabled={requestSubmitting}
            >
              {requestSubmitting ? 'Sending…' : 'Send request'}
            </button>
          </>
        }
      >
        {requestProduct ? (
          <>
            <p className="sales-general-inv__request-lead">
              Request <strong>{requestProduct.product_name}</strong>
              {requestProduct.brand ? ` · ${requestProduct.brand}` : ''}
              {requestProduct.capacity ? ` · ${requestProduct.capacity}` : ''} from{' '}
              <strong>{productWarehouseLabel(requestProduct)}</strong> for{' '}
              <strong>{selectedShop?.name}</strong>.
            </p>
            <form id="sales-general-inv-request-form" className="sales-general-inv__request-form" onSubmit={submitRequest}>
              <label>
                Quantity
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={requestQty}
                  onChange={(e) => setRequestQty(e.target.value)}
                  required
                />
              </label>
              <label>
                Notes <span className="sales-general-inv__optional">(optional)</span>
                <textarea
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="Any details for the warehouse team…"
                />
              </label>
              {requestError ? <p className="sales-alert sales-alert--err">{requestError}</p> : null}
            </form>
          </>
        ) : null}
      </AppModal>
    </div>
  );
}
