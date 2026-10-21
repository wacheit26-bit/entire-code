// ProductList.jsx - Enhanced Latest Section
import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from './ProductCard';
import VendorShowcase from './VendorShowcase';
import VendorCatalogBanner from './VendorCatalogBanner';
import './ProductList.css';
import './VendorShowcase.css';
import { formatProductName, formatTitleCase } from '../utils/formatProductName';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import { stockAtCity, resolveVendorListingProduct } from '../utils/mergeCatalogProducts';
import { collectProductImageUrls, collectVendorShopImageUrls, productHasVendorShopCatalogImage, primaryProductImageUrl } from '../utils/productCatalogImage';

import MoneyXaf from './MoneyXaf';
import { formatBatteryHealthLabel } from '../utils/batteryHealth';

function sortProducts(list, sortKey) {
  const copy = [...list];
  switch (sortKey) {
    case 'name-desc':
      copy.sort((a, b) => String(b.product_name || '').localeCompare(String(a.product_name || ''), undefined, { sensitivity: 'base' }));
      break;
    case 'price-asc':
      copy.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
      break;
    case 'price-desc':
      copy.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
      break;
    case 'name-asc':
    default:
      copy.sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || ''), undefined, { sensitivity: 'base' }));
  }
  return copy;
}

function productTimestamp(p) {
  const raw = p?.createdAt || p?.releaseDate || p?.releasedAt || p?.updatedAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

const CATALOG_CHUNK_SIZE = 6;

function chunkArray(list, size = CATALOG_CHUNK_SIZE) {
  const items = Array.isArray(list) ? list : [];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function DetailModal({ product, onClose, onPreorderFromDetails, canRequestPreorder, userLocation = '' }) {
  if (!product) return null;
  const img = primaryProductImageUrl(product);
  const stock = Number(product.stock) || 0;
  const out = stock <= 0;
  const availability = Array.isArray(product.availability) ? product.availability : [];
  const localStock =
    Number(product.__availableAtUserLocation) ||
    stockAtCity(product, userLocation) ||
    0;
  const requiresDelivery = Boolean(product.__requiresDelivery) || (stock > 0 && userLocation && localStock === 0);
  const availableHere = userLocation && localStock > 0;

  return (
    <div className="stock-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title" onClick={onClose}>
      <div className="stock-detail-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="stock-detail-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="stock-detail-title" className="stock-detail-title">
          {formatProductName(product.product_name ?? product.name)}
        </h2>
        {img ? <img className="stock-detail-img" src={img} alt="" loading="lazy" decoding="async" /> : null}
        <dl className="stock-detail-dl">
          <div><dt>Brand</dt><dd>{formatTitleCase(product.brand, '—')}</dd></div>
          <div><dt>Type</dt><dd>{formatTitleCase(product.product_type, '—')}</dd></div>
          <div><dt>Capacity</dt><dd>{product.capacity ?? '—'}</dd></div>
          <div><dt>Color</dt><dd>{formatTitleCase(product.color, '—')}</dd></div>
          <div><dt>Country</dt><dd>{formatTitleCase(product.country, '—')}</dd></div>
          <div><dt>SIM</dt><dd>{product.sim ?? '—'}</dd></div>
          {formatBatteryHealthLabel(product.batteryHealth) ? (
            <div>
              <dt>Battery health</dt>
              <dd>{formatBatteryHealthLabel(product.batteryHealth)}</dd>
            </div>
          ) : null}
          <div><dt>Total stock</dt><dd>{product.stock ?? 0}</dd></div>
          {userLocation ? (
            <div>
              <dt>Your area ({userLocation})</dt>
              <dd>{localStock > 0 ? `${localStock} available now` : 'Not in stock locally'}</dd>
            </div>
          ) : null}
          <div><dt>Price</dt><dd><MoneyXaf value={product.price} /></dd></div>
          {availability.length > 0 ? (
            <div className="stock-detail-availability">
              <dt>Available at</dt>
              <dd>
                <ul className="stock-detail-availability__list">
                  {availability.map((row) => (
                    <li key={row.productId}>
                      <span className="stock-detail-availability__place">{row.label}</span>
                      <span className="stock-detail-availability__qty">
                        {row.stock} unit{row.stock === 1 ? '' : 's'}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ) : null}
          {product.description ? (
            <div className="stock-detail-desc">
              <dt>Description</dt>
              <dd>{product.description}</dd>
            </div>
          ) : null}
        </dl>
        {requiresDelivery && !out ? (
          <div className="stock-detail-delivery">
            <p className="stock-detail-delivery__title">Available from another location</p>
            <p className="stock-detail-delivery__text">
              This product is not in stock at your location right now, but you can still order it. We
              expect delivery to {userLocation || 'your area'} in about <strong>2–3 days</strong>. We
              will message you when your order is ready or when the stock arrives.
            </p>
          </div>
        ) : null}
        {availableHere ? (
          <p className="stock-detail-local-ok">In stock in your area — you can buy or add to cart now.</p>
        ) : null}
        {out && canRequestPreorder ? (
          <div className="stock-detail-preorder">
            <p className="stock-detail-preorder__text">This item is out of stock everywhere. You can still ask us to reserve quantity for when it is back.</p>
            <button
              type="button"
              className="stock-detail-preorder__btn"
              onClick={() => {
                onPreorderFromDetails?.(product);
              }}
            >
              Request preorder
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Enhanced Latest Product Card Component
// LatestProductCard Component - Updated for proper image display
function LatestProductCard({
  product,
  index,
  onViewDetails,
  onAddToCart,
  onBuyRequest,
  onOfferRequest,
  onOpenPreorder,
  canOpenPreorder,
  buyNowSubmittingProductId,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const colorVariants = useMemo(
    () => (Array.isArray(product?.__colorVariants) ? product.__colorVariants : []),
    [product],
  );
  const hasColorChoice = colorVariants.length > 1;

  const [selectedVariantId, setSelectedVariantId] = useState(() => {
    const firstInStock = colorVariants.find((v) => v.stock > 0);
    return String((firstInStock || colorVariants[0])?.productId || product._id || product.id || '');
  });

  useEffect(() => {
    const firstInStock = colorVariants.find((v) => v.stock > 0);
    const nextId = String((firstInStock || colorVariants[0])?.productId || product._id || product.id || '');
    setSelectedVariantId(nextId);
  }, [product.__catalogKey, product._id, product.id, colorVariants]);

  const activeProduct = useMemo(
    () => resolveVendorListingProduct(product, selectedVariantId),
    [product, selectedVariantId],
  );

  const images = useMemo(() => collectProductImageUrls(activeProduct), [activeProduct]);
  
  const primaryImage = images[0] || '';
  const hasMultipleImages = images.length > 1;
  const discountPercent = activeProduct.discount ? Math.round((1 - activeProduct.price / activeProduct.original_price) * 100) : 0;
  
  // Auto-rotate images on hover
  useEffect(() => {
    if (!hasMultipleImages || !isHovered) return;
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [hasMultipleImages, isHovered, images.length]);
  
  // Reset to first image when not hovering
  useEffect(() => {
    if (!isHovered) {
      setCurrentImageIndex(0);
    }
  }, [isHovered]);
  
  const getBadgeClass = () => {
    if (index === 0) return 'latest-badge--featured';
    if (index === 1) return 'latest-badge--hot';
    if (index === 2) return 'latest-badge--new';
    return '';
  };
  
  const getBadgeText = () => {
    if (index === 0) return 'Featured';
    if (index === 1) return 'Hot Deal';
    if (index === 2) return 'Just Added';
    return '';
  };
  
  const currentDisplayImage = hasMultipleImages && isHovered ? images[currentImageIndex] : primaryImage;
  const productStableId = String(activeProduct._id ?? activeProduct.id ?? '');
  const buyNowLoading = Boolean(buyNowSubmittingProductId && buyNowSubmittingProductId === productStableId);
  const stock = Number(activeProduct.stock) || 0;
  const belowMinBuy = stock > 0 && stock < MIN_BUY_QUANTITY;

  return (
    <div 
      className={`latest-product-card ${index === 0 ? 'latest-product-card--featured' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="latest-product-card__badge">
        <span className={getBadgeClass()}>{getBadgeText()}</span>
      </div>
      
      <div className="latest-product-card__image-wrapper">
        <button 
          className="latest-product-card__image-link"
          onClick={() => onViewDetails?.(activeProduct)}
        >
          {!imageLoaded && !imageError && <div className="latest-product-card__skeleton" />}
          {currentDisplayImage ? (
            <img
              src={currentDisplayImage}
              alt={activeProduct.product_name || 'Product image'}
              className={`latest-product-card__image ${imageLoaded ? 'latest-product-card__image--loaded' : ''}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              loading="eager"
            />
          ) : null}
        </button>
        
        {hasMultipleImages && images.length > 1 && (
          <div className="latest-product-card__image-counter">
            {currentImageIndex + 1} / {images.length}
          </div>
        )}
        
        <div className="latest-product-card__overlay">
          <button 
            className="latest-product-card__quick-view"
            onClick={() => onViewDetails?.(activeProduct)}
          >
            Quick View
          </button>
        </div>
      </div>
      
      <div className="latest-product-card__content">
        <div className="latest-product-card__header">
          <h3 className="latest-product-card__title">
            <button onClick={() => onViewDetails?.(activeProduct)}>
              {formatProductName(activeProduct.product_name)}
            </button>
          </h3>
          {discountPercent > 0 && (
            <span className="latest-product-card__discount">-{discountPercent}%</span>
          )}
        </div>
        
        <div className="latest-product-card__specs">
          <div className="latest-spec">
            <span className="latest-spec-label">Capacity</span>
            <span className="latest-spec-value">{activeProduct.capacity || '—'}</span>
          </div>
          <div className="latest-spec">
            <span className="latest-spec-label">Color</span>
            {hasColorChoice ? (
              <select
                className="latest-product-card__color-select"
                value={selectedVariantId}
                onChange={(e) => setSelectedVariantId(e.target.value)}
                aria-label={`Color for ${formatProductName(activeProduct.product_name)}`}
              >
                {colorVariants.map((variant) => (
                  <option
                    key={variant.productId}
                    value={String(variant.productId)}
                    disabled={variant.stock <= 0}
                  >
                    {formatTitleCase(variant.color, 'Standard')}
                    {variant.stock > 0 ? ` (${variant.stock})` : ' (out)'}
                  </option>
                ))}
              </select>
            ) : (
              <span className="latest-spec-value">
                <span className="latest-color-dot" style={{ backgroundColor: getColorValue(activeProduct.color) }} />
                {formatTitleCase(activeProduct.color, '—')}
              </span>
            )}
          </div>
          {formatBatteryHealthLabel(activeProduct.batteryHealth) ? (
            <div className="latest-spec">
              <span className="latest-spec-label">Battery</span>
              <span className="latest-spec-value">
                {formatBatteryHealthLabel(activeProduct.batteryHealth)}
              </span>
            </div>
          ) : null}
        </div>
        
        <div className="latest-product-card__price-section">
          <div className="latest-price-wrapper">
            <span className="latest-current-price">
              <MoneyXaf value={activeProduct.price} />
            </span>
            {activeProduct.original_price && activeProduct.original_price > activeProduct.price && (
              <span className="latest-original-price">
                <MoneyXaf value={activeProduct.original_price} />
              </span>
            )}
          </div>
          <div className="latest-stock-status">
            <span className={`latest-stock-badge ${stock > 0 ? 'latest-stock-badge--in' : 'latest-stock-badge--out'}`}>
              {stock > 0 ? `${stock} in stock` : 'Out of stock'}
            </span>
          </div>
        </div>
        
        <div className="latest-product-card__actions">
          {stock > 0 ? (
            <>
              <button
                type="button"
                className={`latest-btn latest-btn--buy${buyNowLoading ? ' latest-btn--buy-loading' : ''}`}
                onClick={() => onBuyRequest?.(activeProduct, MIN_BUY_QUANTITY)}
                disabled={buyNowLoading || belowMinBuy}
                aria-busy={buyNowLoading}
              >
                {buyNowLoading ? (
                  <>
                    <span className="latest-btn__spinner" aria-hidden />
                    Sending…
                  </>
                ) : (
                  'Buy Now'
                )}
              </button>
              <button
                className="latest-btn latest-btn--cart"
                onClick={() => onAddToCart?.(activeProduct._id ?? activeProduct.id, MIN_BUY_QUANTITY)}
                disabled={belowMinBuy}
              >
                Add to Cart
              </button>
            </>
          ) : (
            <button
              type="button"
              className="latest-btn latest-btn--preorder"
              onClick={() => onOpenPreorder?.(activeProduct)}
              disabled={!canOpenPreorder || !onOpenPreorder}
            >
              Request preorder
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
export default function ProductList({
  products = [],
  userLocation = '',
  searchQuery = '',
  onAddToCart,
  onAddOfferToCart,
  onBuyRequest,
  buyNowSubmittingProductId = null,
  onOfferRequest,
  onPreorderModalOpen,
  cartItems = [],
  cartSubtotal = 0,
  onUpdateCartQty,
  onRemoveCartItem,
  onCheckout,
  checkoutSubmitting = false,
  canCheckout = true,
  loading = false,
}) {
  const [detailProduct, setDetailProduct] = useState(null);
  const [cartSidebarOpen, setCartSidebarOpen] = useState(true);
  const catalogSectionRef = useRef(null);
  const prevCartLen = useRef(0);

  const canOpenPreorder = Boolean(canCheckout && onPreorderModalOpen);
  const openPreorderForProduct = useCallback(
    (product) => {
      onPreorderModalOpen?.({
        product,
        initialName: formatProductName(product?.product_name ?? product?.name ?? ''),
      });
    },
    [onPreorderModalOpen],
  );

  const openPreorderFreeText = useCallback(() => {
    onPreorderModalOpen?.({ product: null, initialName: searchQuery.trim() });
  }, [onPreorderModalOpen, searchQuery]);

  const handlePreorderFromDetails = useCallback(
    (product) => {
      setDetailProduct(null);
      openPreorderForProduct(product);
    },
    [openPreorderForProduct],
  );

  const [desktopCartLayout, setDesktopCartLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1280px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const onChange = () => setDesktopCartLayout(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const n = cartItems.length;
    if (n === 0) setCartSidebarOpen(true);
    else if (prevCartLen.current === 0 && n > 0) setCartSidebarOpen(true);
    prevCartLen.current = n;
  }, [cartItems.length]);

  const sorted = useMemo(() => sortProducts(products, 'name-asc'), [products]);
  const showcaseProducts = useMemo(
    () => products.filter((p) => productHasVendorShopCatalogImage(p)),
    [products],
  );
  const catalogProducts = useMemo(
    () => sorted.filter((p) => productHasVendorShopCatalogImage(p)),
    [sorted],
  );
  const catalogChunks = useMemo(() => chunkArray(catalogProducts, CATALOG_CHUNK_SIZE), [catalogProducts]);

  const total = catalogProducts.length;
  const chunkCount = catalogChunks.length;
  const hasCartItems = cartItems.length > 0;
  const useCartColumnLayout = hasCartItems && cartSidebarOpen && desktopCartLayout;
  const showCartPanel = useCartColumnLayout;

  return (
    <div className="stock-list">
      {!loading && showcaseProducts.length > 0 ? (
        <VendorShowcase
          products={showcaseProducts}
          onViewDetails={setDetailProduct}
          onBuyRequest={onBuyRequest}
          buyNowSubmittingProductId={buyNowSubmittingProductId}
        />
      ) : null}

      <div ref={catalogSectionRef} className="stock-list__catalog-anchor">
      <header className="vendor-section-head vendor-section-head--catalog">
        <div className="vendor-section-head__row">
          <h2 id="stock-list-section-title" className="vendor-section-head__title">
            Stock catalog
          </h2>
          <p className="vendor-section-head__meta">
            {total === 0
              ? 'No results'
              : `${total} product${total === 1 ? '' : 's'} · ${chunkCount} section${chunkCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </header>

      <div className="stock-list__subnav" aria-label="Stock listing controls">
        <div className="stock-list__subnav-text visually-hidden">
          <h1 className="stock-list__subnav-title">Stock catalog</h1>
          <p className="stock-list__subnav-meta">
            {total === 0 ? 'No results' : `${total} products in ${chunkCount} sections`}
          </p>
        </div>
        <div className="stock-list__subnav-toolbar">
          {hasCartItems && !cartSidebarOpen ? (
            <button
              type="button"
              className="stock-list__cart-reopen"
              onClick={() => setCartSidebarOpen(true)}
            >
              Show cart ({cartItems.length})
            </button>
          ) : null}
        </div>
      </div>

      <div className={`stock-list__layout ${showCartPanel ? 'stock-list__layout--with-cart' : ''}`}>
        <div className="stock-list__catalog-stream">
          {loading ? (
            <p className="stock-list__loading">Loading products…</p>
          ) : (
            catalogChunks.map((chunk, chunkIndex) => {
              const chunkStart = chunkIndex * CATALOG_CHUNK_SIZE + 1;
              const chunkEnd = chunkStart + chunk.length - 1;
              const sectionId = `stock-catalog-section-${chunkIndex}`;

              return (
                <Fragment key={sectionId}>
                  <section
                    className="stock-list__catalog-section"
                    aria-label={
                      chunkCount > 1
                        ? `Stock catalog part ${chunkIndex + 1}, items ${chunkStart}–${chunkEnd}`
                        : `Stock catalog items ${chunkStart}–${chunkEnd}`
                    }
                  >
                    <ul
                      className={`stock-list__cards stock-list__cards--six ${showCartPanel ? 'stock-list__cards--with-cart' : ''}`}
                    >
                      {chunk.map((p, idx) => {
                        const globalIdx = chunkIndex * CATALOG_CHUNK_SIZE + idx;
                        return (
                          <li key={p.__catalogKey ?? p._id ?? p.id}>
                            <ProductCard
                              product={p}
                              onAddToCart={onAddToCart}
                              onAddOfferToCart={onAddOfferToCart}
                              onBuyRequest={onBuyRequest}
                              buyNowSubmittingProductId={buyNowSubmittingProductId}
                              onOfferRequest={onOfferRequest}
                              onOpenPreorder={openPreorderForProduct}
                              canOpenPreorder={canOpenPreorder}
                              onViewDetails={setDetailProduct}
                              imageLoading={globalIdx < 8 ? 'eager' : 'lazy'}
                              imageFetchPriority={globalIdx < 8 ? 'high' : 'low'}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                  {chunkIndex < catalogChunks.length - 1 ? (
                    <VendorCatalogBanner
                      products={showcaseProducts}
                      sectionIndex={chunkIndex}
                    />
                  ) : null}
                </Fragment>
              );
            })
          )}
        </div>

        {showCartPanel && (
          <aside className="stock-list__cart-panel" aria-label="Cart summary">
            <div className="stock-list__cart-head">
              <div className="stock-list__cart-head-text">
                <h2>Cart</h2>
                <span>{cartItems.length} product{cartItems.length > 1 ? 's' : ''}</span>
              </div>
              <button
                type="button"
                className="stock-list__cart-close"
                disabled={checkoutSubmitting}
                onClick={() => setCartSidebarOpen(false)}
                aria-label="Hide cart sidebar"
              >
                ×
              </button>
            </div>

            <ul className="stock-list__cart-items">
              {cartItems.map((item) => {
                const isOffer = String(item.orderType || 'buy') === 'offer';
                const rawQty = Math.floor(Number(item.qty) || 0);
                const qty = isOffer ? Math.max(1, rawQty) : Math.max(MIN_BUY_QUANTITY, rawQty);
                const unit = isOffer ? (Number(item.offerAmount) || 0) : (Number(item.product?.price) || 0);
                const totalLine = qty * unit;
                const image = primaryProductImageUrl(item.product);
                const name = formatProductName(item.product?.product_name ?? item.product?.name ?? 'Product');
                return (
                  <li key={item.id} className="stock-list__cart-item">
                    <div className="stock-list__cart-item-main">
                      {image ? (
                        <img src={image} alt="" className="stock-list__cart-item-img" loading="lazy" decoding="async" />
                      ) : null}
                      <div className="stock-list__cart-item-text">
                        <p className="stock-list__cart-item-title">{name}</p>
                        <p className="stock-list__cart-item-price">
                          <MoneyXaf value={unit} />
                        </p>
                        <p className="stock-list__cart-item-price">{isOffer ? 'Offer request' : 'Buy order'}</p>
                      </div>
                    </div>

                    <div className="stock-list__cart-item-controls">
                      <div className="stock-list__qty-stepper" role="group" aria-label={`Quantity for ${name}`}>
                        <button
                          type="button"
                          onClick={() => onUpdateCartQty?.(item.id, qty - 1)}
                          disabled={checkoutSubmitting || (isOffer ? qty <= 1 : qty <= MIN_BUY_QUANTITY)}
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span>{qty}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateCartQty?.(item.id, qty + 1)}
                          disabled={
                            checkoutSubmitting ||
                            (!isOffer &&
                              Number(item.product?.stock) > 0 &&
                              qty >= Number(item.product?.stock))
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="stock-list__cart-remove"
                        disabled={checkoutSubmitting}
                        onClick={() => onRemoveCartItem?.(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <p className="stock-list__cart-line-total">
                      <MoneyXaf value={totalLine} />
                    </p>
                  </li>
                );
              })}
            </ul>

            <div className="stock-list__cart-summary">
              <div>
                <span>Subtotal</span>
                <strong>
                  <MoneyXaf value={cartSubtotal} />
                </strong>
              </div>
            </div>

            <div className="stock-list__cart-actions">
              <button
                type="button"
                className="stock-list__cart-checkout"
                disabled={!canCheckout || cartItems.length === 0 || checkoutSubmitting}
                aria-busy={checkoutSubmitting}
                onClick={() => {
                  if (!canCheckout || cartItems.length === 0 || checkoutSubmitting) return;
                  void onCheckout?.();
                }}
              >
                {checkoutSubmitting ? 'Submitting…' : 'Continue'}
              </button>
              <Link to="/cart" className="stock-list__cart-open-full" tabIndex={checkoutSubmitting ? -1 : undefined} aria-disabled={checkoutSubmitting} onClick={(e) => checkoutSubmitting && e.preventDefault()}>
                Open full cart
              </Link>
            </div>
          </aside>
        )}
      </div>

      {!loading && total === 0 && (
        <div className="stock-list__empty-wrap">
          <p className="stock-list__empty">No products match your filters.</p>
          {searchQuery.trim() && onPreorderModalOpen ? (
            <div className="stock-list__empty-preorder">
              <p className="stock-list__empty-preorder__text">
                If you are looking for something that is not listed, you can still send a preorder with the name and quantity you need.
              </p>
              <button
                type="button"
                className="stock-list__empty-preorder__btn"
                onClick={openPreorderFreeText}
                disabled={!canOpenPreorder}
              >
                Request a preorder
              </button>
            </div>
          ) : null}
        </div>
      )}
      </div>

      <DetailModal
        product={detailProduct}
        userLocation={userLocation}
        onClose={() => setDetailProduct(null)}
        onPreorderFromDetails={handlePreorderFromDetails}
        canRequestPreorder={canOpenPreorder}
      />
    </div>
  );
}

function getColorValue(color) {
  const colorKey = String(color || '').trim().toUpperCase();
  const colors = {
    'BLACK': '#000000', 'WHITE': '#FFFFFF', 'RED': '#EF4444', 'BLUE': '#3B82F6',
    'GREEN': '#10B981', 'YELLOW': '#F59E0B', 'PURPLE': '#8B5CF6', 'PINK': '#EC4899',
    'GRAY': '#6B7280', 'SILVER': '#C0C0C0', 'GOLD': '#FFD700', 'SPACE GRAY': '#4A4A4A'
  };
  return colors[colorKey] || '#E5E7EB';
}