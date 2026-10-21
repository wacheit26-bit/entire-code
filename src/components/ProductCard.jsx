// ProductCard.jsx - Enhanced with professional offer modal
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ProductCard.css';
import { formatProductName, formatTitleCase } from '../utils/formatProductName';
import { formatBatteryHealthLabel } from '../utils/batteryHealth';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import { collectVendorShopImageUrls } from '../utils/productCatalogImage';
import { formatMoneyXaf } from '../utils/formatMoneyXaf';
import MoneyXaf from './MoneyXaf';
import { resolveVendorListingProduct } from '../utils/mergeCatalogProducts';

// Enhanced Offer Modal Component
const OfferModal = ({ 
  product, 
  listPrice, 
  stock, 
  onClose, 
  onSubmit, 
  onAddToCart 
}) => {
  const [offerPrice, setOfferPrice] = useState('');
  const [offerQty, setOfferQty] = useState(1);
  const [offerError, setOfferError] = useState('');
  const [offerSubmitting, setOfferSubmitting] = useState(false);
  /** 'form' | 'success' — success is a custom confirmation (no window / system alert). */
  const [offerStep, setOfferStep] = useState('form');

  const formatNumberInput = (value) => {
    const num = value.replace(/\D/g, '');
    return num.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const handlePriceChange = (e) => {
    const rawValue = e.target.value.replace(/\s/g, '');
    setOfferPrice(rawValue);
    setOfferError('');
  };

  const validateOffer = () => {
    const price = Number(String(offerPrice).replace(/\s/g, '').replace(',', '.'));
    const qty = Math.max(1, Math.floor(Number(offerQty) || 1));

    if (!Number.isFinite(price) || price <= 0) {
      return { error: 'Please enter a valid price amount' };
    }
    if (price >= listPrice) {
      return { error: `Your offer must be below the list price of ${formatFcfa(listPrice)}` };
    }
    if (price < listPrice * 0.3) {
      return { error: 'Offer seems too low. Please enter a more reasonable amount (min 30% of list price)' };
    }
    if (stock > 0 && qty > stock) {
      return { error: `Only ${stock} units available in stock` };
    }
    if (qty < 1) {
      return { error: 'Quantity must be at least 1' };
    }
    return { price, qty };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateOffer();
    if (validation.error) {
      setOfferError(validation.error);
      return;
    }
    setOfferSubmitting(true);
    try {
      await onSubmit(validation.price, validation.qty);
      setOfferStep('success');
    } catch (err) {
      setOfferError('Unable to submit offer. Please try again.');
    } finally {
      setOfferSubmitting(false);
    }
  };

  const handleAddToCart = () => {
    const validation = validateOffer();
    if (validation.error) {
      setOfferError(validation.error);
      return;
    }
    onAddToCart(validation.price, validation.qty);
    onClose();
  };

  const savingsAmount = offerPrice && listPrice ? listPrice - Number(offerPrice) : 0;
  const savingsPercent = offerPrice && listPrice ? ((savingsAmount / listPrice) * 100).toFixed(1) : 0;

  if (offerStep === 'success') {
    return (
      <div className="modal-overlay wache-dialog-light" onClick={onClose} role="presentation">
        <div
          className="modal-content offer-modal offer-modal--success-view"
          role="dialog"
          aria-modal="true"
          aria-labelledby="offer-success-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          <div className="offer-modal__success">
            <div className="offer-modal__success-icon" aria-hidden>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 id="offer-success-title" className="offer-modal__success-title">
              Offer submitted
            </h3>
            <p className="offer-modal__success-text">
              Your price offer was sent successfully. You’ll get a notification when the seller responds.
            </p>
            <button type="button" className="btn-primary offer-modal__success-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay wache-dialog-light" onClick={onClose} role="presentation">
      <div className="modal-content offer-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="offer-modal__header">
          <div className="offer-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <h3 className="modal-title">Make an Offer</h3>
          <p className="offer-subtitle">Get this product at your desired price</p>
        </div>

        <div className="offer-modal__product-info">
          <div className="product-details">
            <h4 className="product-name">{product.name}</h4>
            <div className="price-comparison">
              <span className="list-price-label">List Price:</span>
              <span className="list-price-value">
                <MoneyXaf value={listPrice} />
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="offer-modal__price-section">
            <label className="form-label">
              Your Offer Price
              <span className="label-hint">(FCFA)</span>
            </label>

            <div className="price-input-wrapper">
              <input
                type="text"
                placeholder="Enter your offer amount"
                value={offerPrice ? formatNumberInput(offerPrice) : ''}
                onChange={handlePriceChange}
                className="price-input"
                autoFocus
              />
            </div>

            {offerPrice && Number(offerPrice) > 0 && (
              <div className="savings-preview">
                <div className="savings-badge">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  <span>
                    You save <MoneyXaf value={savingsAmount} /> ({savingsPercent}%)
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="offer-modal__quantity-section">
            <label className="form-label">
              Quantity
              <span className="label-hint">(max {stock} available)</span>
            </label>
            <div className="quantity-selector">
              <button
                type="button"
                className="qty-control-btn"
                onClick={() => setOfferQty(Math.max(1, offerQty - 1))}
                disabled={offerQty <= 1}
              >
                −
              </button>
              <input
                type="number"
                value={offerQty}
                onChange={(e) => {
                  const val = Math.min(stock, Math.max(1, parseInt(e.target.value) || 1));
                  setOfferQty(val);
                }}
                min="1"
                max={stock}
                className="quantity-input"
              />
              <button
                type="button"
                className="qty-control-btn"
                onClick={() => setOfferQty(Math.min(stock, offerQty + 1))}
                disabled={offerQty >= stock}
              >
                +
              </button>
            </div>
          </div>

          {offerError && (
            <div className="offer-error">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {offerError}
            </div>
          )}

          <div className="offer-modal__info">
            <div className="info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span>Seller typically responds within 24 hours</span>
            </div>
            <div className="info-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 12V8h-4M4 12V8h4M12 4v16M8 4h8M4 8h16" />
                <path d="M12 12l4 4M12 12l-4 4" />
              </svg>
              <span>Offer is binding once accepted</span>
            </div>
          </div>

          <div className="offer-modal__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-outline" onClick={handleAddToCart} disabled={offerSubmitting}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
              Add to Cart
            </button>
            <button type="submit" className="btn-primary" disabled={offerSubmitting}>
              {offerSubmitting ? (
                <>
                  <span className="spinner"></span>
                  Submitting...
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                  Send Offer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Icons (same as before)
const Icons = {
  ShoppingCart: ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Heart: ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  ),
  Eye: ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  ChevronRight: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  Package: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  ),
  Truck: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  Box: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
    </svg>
  ),
};

// Utility functions
const formatFcfa = (value) => formatMoneyXaf(value);

const getRandomInterval = (minSeconds = 5, maxSeconds = 12) => {
  return (Math.random() * (maxSeconds - minSeconds) + minSeconds) * 1000;
};

const getOptimizedImageUrl = (url, width = 400, quality = 85) => {
  if (!url) return '';
  if (url.includes('cloudinary') || url.includes('res.cloudinary')) {
    return url.replace('/upload/', `/upload/w_${width},c_fill,q_${quality},f_auto,dpr_auto/`);
  }
  return url;
};

const getSrcSet = (url) => {
  if (!url || !url.includes('cloudinary')) return '';
  const baseUrl = url.split('/upload/')[0] + '/upload/';
  const publicId = url.split('/upload/')[1];
  return `
    ${baseUrl}w_200,c_fill,q_85,f_auto/${publicId} 200w,
    ${baseUrl}w_400,c_fill,q_85,f_auto/${publicId} 400w,
    ${baseUrl}w_600,c_fill,q_85,f_auto/${publicId} 600w,
    ${baseUrl}w_800,c_fill,q_85,f_auto/${publicId} 800w
  `;
};

export default function ProductCard({ 
  product, 
  onAddToCart, 
  onAddOfferToCart,
  onBuyRequest, 
  buyNowSubmittingProductId = null,
  onOfferRequest, 
  onOpenPreorder,
  canOpenPreorder = false,
  onViewDetails,
  onWishlist,
  variant = 'default'
}) {
  const [quantity, setQuantity] = useState(MIN_BUY_QUANTITY);
  const [offerOpen, setOfferOpen] = useState(false);
  const [cartAnimating, setCartAnimating] = useState(false);
  const [cartAddedMsg, setCartAddedMsg] = useState(false);
  const [loadedImages, setLoadedImages] = useState({});
  const [imageError, setImageError] = useState({});
  const [imageIndex, setImageIndex] = useState(0);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false);
  const timersRef = useRef({});
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);
  const [carouselInterval, setCarouselInterval] = useState(null);
  const [canUsePortal, setCanUsePortal] = useState(false);

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

  useEffect(() => {
    setQuantity(MIN_BUY_QUANTITY);
    setImageIndex(0);
  }, [selectedVariantId]);

  // Memoized product data with optimized images
  const productData = useMemo(() => ({
    id: activeProduct._id ?? activeProduct.id,
    name: formatProductName(activeProduct.product_name ?? activeProduct.name ?? 'Unnamed Product'),
    brand: formatTitleCase(activeProduct.brand, ''),
    stock: Number(activeProduct.stock) || 0,
    price: activeProduct.price,
    originalPrice: activeProduct.original_price || activeProduct.price,
    discount: activeProduct.discount || 0,
    soldCount: activeProduct.soldCount || 0,
    uniqueSeed: Math.random(),
    images: (() => {
      const allImages = collectVendorShopImageUrls(activeProduct);
      return {
        all: allImages,
        primary: allImages[0] || '',
        optimized: {
          small: allImages.map(url => getOptimizedImageUrl(url, 300, 85)),
          medium: allImages.map(url => getOptimizedImageUrl(url, 600, 85)),
          large: allImages.map(url => getOptimizedImageUrl(url, 800, 85)),
        },
        srcSet: allImages.map(url => getSrcSet(url))
      };
    })(),
    specs: {
      capacity: activeProduct.capacity ?? '—',
      color: formatTitleCase(activeProduct.color, '—'),
      country: formatTitleCase(activeProduct.country, '—'),
    },
    badges: {
      isNew: activeProduct.isNew || false,
      isFeatured: activeProduct.isFeatured || false,
      isHot: activeProduct.isHot || false,
    }
  }), [activeProduct]);

  const batteryHealthLabel = useMemo(
    () => formatBatteryHealthLabel(activeProduct?.batteryHealth),
    [activeProduct?.batteryHealth],
  );

  const isOutOfStock = productData.stock === 0;
  const belowMinBuyStock = productData.stock > 0 && productData.stock < MIN_BUY_QUANTITY;
  const buyNowLoading = Boolean(
    buyNowSubmittingProductId && String(buyNowSubmittingProductId) === String(productData.id),
  );
  const listPrice = Number(productData.price) || 0;

  const currentImageUrl = productData.images.optimized.medium[imageIndex] || 
                          productData.images.all[imageIndex] || 
                          productData.images.primary;
  
  const currentSrcSet = productData.images.srcSet[imageIndex];
  const isImageLoaded = loadedImages[currentImageUrl];
  const hasImageError = imageError[currentImageUrl];

  useEffect(() => {
    setCanUsePortal(typeof document !== 'undefined' && Boolean(document.body));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !cardRef.current) {
      setIsInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(entry?.isIntersecting);
      },
      { root: null, rootMargin: '200px 0px', threshold: 0.01 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setImageIndex(0);
    setLoadedImages({});
    setImageError({});
    setImagePreviewOpen(false);
  }, [productData.id]);

  useEffect(() => {
    const s = productData.stock;
    if (s > 0 && s < MIN_BUY_QUANTITY) {
      setQuantity(s);
      return;
    }
    const maxBuy = s > 0 ? s : 9999;
    setQuantity((prev) => Math.min(Math.max(MIN_BUY_QUANTITY, prev), maxBuy));
  }, [productData.id, productData.stock]);

  useEffect(() => {
    if (!isInView || productData.images.all.length <= 1) {
      if (carouselInterval) {
        clearInterval(carouselInterval);
        setCarouselInterval(null);
      }
      return;
    }
    
    const minSeconds = 5;
    const maxSeconds = 12;
    const randomOffset = (parseInt(productData.id?.slice(-4) || '0', 16) || 0) % 7000;
    const intervalTime = getRandomInterval(minSeconds, maxSeconds) + randomOffset;
    
    const timer = setInterval(() => {
      setImageIndex((prev) => {
        const nextIndex = (prev + 1) % productData.images.all.length;
        setLoadedImages(prevLoaded => ({
          ...prevLoaded,
          [productData.images.optimized.medium[nextIndex]]: false
        }));
        return nextIndex;
      });
    }, intervalTime);
    
    setCarouselInterval(timer);
    
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isInView, productData.images.all.length, productData.id, productData.images.optimized.medium]);

  useEffect(() => {
    if (!isInView) return;
    
    const nextIndex = (imageIndex + 1) % productData.images.all.length;
    const nextImage = productData.images.optimized.medium[nextIndex] || productData.images.all[nextIndex];
    
    if (nextImage && !loadedImages[nextImage]) {
      const img = new Image();
      img.decoding = 'async';
      img.src = nextImage;
    }
  }, [imageIndex, productData.images.all.length, productData.images.optimized.medium, loadedImages, isInView]);

  const goImage = useCallback((newIndex) => {
    const normalized = (newIndex + productData.images.all.length) % productData.images.all.length;
    setImageIndex(normalized);
    
    if (carouselInterval) {
      clearInterval(carouselInterval);
      const minSeconds = 5;
      const maxSeconds = 12;
      const randomOffset = (parseInt(productData.id?.slice(-4) || '0', 16) || 0) % 7000;
      const intervalTime = getRandomInterval(minSeconds, maxSeconds) + randomOffset;
      
      const newTimer = setInterval(() => {
        setImageIndex((prev) => {
          const nextIndex = (prev + 1) % productData.images.all.length;
          setLoadedImages(prevLoaded => ({
            ...prevLoaded,
            [productData.images.optimized.medium[nextIndex]]: false
          }));
          return nextIndex;
        });
      }, intervalTime);
      
      setCarouselInterval(newTimer);
      
      const currentTimer = newTimer;
      return () => clearInterval(currentTimer);
    }
  }, [productData.images.all.length, productData.id, productData.images.optimized.medium, carouselInterval]);

  const handleImageLoad = useCallback((url) => {
    setLoadedImages(prev => ({ ...prev, [url]: true }));
  }, []);

  const handleImageError = useCallback((url) => {
    setImageError(prev => ({ ...prev, [url]: true }));
  }, []);

  const handleQuantityChange = useCallback((newQuantity) => {
    const s = productData.stock;
    if (s > 0 && s < MIN_BUY_QUANTITY) return;
    const maxBuy = s > 0 ? s : 9999;
    setQuantity(Math.min(Math.max(MIN_BUY_QUANTITY, newQuantity), maxBuy));
  }, [productData.stock]);

  const handleAddToCart = useCallback(() => {
    if (cartAnimating || isOutOfStock || belowMinBuyStock) return;
    onAddToCart?.(productData.id, quantity);
    setCartAnimating(true);
    setCartAddedMsg(false);
    timersRef.current.cartAnim = setTimeout(() => {
      setCartAnimating(false);
      setCartAddedMsg(true);
      timersRef.current.cartMsg = setTimeout(() => setCartAddedMsg(false), 2500);
    }, 2500);
  }, [onAddToCart, productData.id, quantity, cartAnimating, isOutOfStock, belowMinBuyStock]);

  const openOfferModal = useCallback(() => {
    setOfferOpen(true);
  }, []);

  const closeOfferModal = useCallback(() => {
    setOfferOpen(false);
  }, []);

  const handleOfferSubmit = useCallback(async (price, qty) => {
    await onOfferRequest?.(activeProduct, { offerAmount: price, quantity: qty });
  }, [onOfferRequest, activeProduct]);

  const handleOfferAddToCart = useCallback((price, qty) => {
    onAddOfferToCart?.(activeProduct, { offerAmount: price, quantity: qty });
  }, [onAddOfferToCart, activeProduct]);

  const imageCount = productData.images.all.length;

  useEffect(() => {
    if (!imagePreviewOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setImagePreviewOpen(false);
      if (e.key === 'ArrowLeft' && imageCount > 1) {
        setImageIndex((prev) => (prev - 1 + imageCount) % imageCount);
      }
      if (e.key === 'ArrowRight' && imageCount > 1) {
        setImageIndex((prev) => (prev + 1) % imageCount);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [imagePreviewOpen, imageCount]);

  const showLowStockBadge = productData.stock > 0 && productData.stock <= 20;
  const stockLabel = isOutOfStock ? 'Out of stock' : 'In Stock';
  const unitLabel = `${productData.stock} unit${productData.stock === 1 ? '' : 's'}`;

  return (
    <div ref={cardRef} className="product-card product-card--premium product-card--vendor">
      <div className="product-card__image-section">
        <button
          className="product-card__image-link"
          onClick={() => {
            if (currentImageUrl && !hasImageError) setImagePreviewOpen(true);
          }}
          aria-label={`Open full image for ${productData.name}`}
        >
          <div className="product-card__image-wrapper">
            {showLowStockBadge ? (
              <span className="product-card__scarcity-badge">
                <span className="product-card__scarcity-dot" aria-hidden />
                Only few left
              </span>
            ) : null}

            {productData.brand ? (
              <span className="product-card__brand-badge" title={productData.brand}>
                {productData.brand}
              </span>
            ) : null}

            {!isImageLoaded && !hasImageError && isInView && currentImageUrl ? (
              <div className="product-card__image-skeleton" />
            ) : null}

            {isInView && currentImageUrl && !hasImageError ? (
              <img
                src={currentImageUrl}
                srcSet={currentSrcSet || currentImageUrl}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                alt={productData.name}
                className={`product-card__image ${isImageLoaded ? 'product-card__image--loaded' : ''}`}
                loading="lazy"
                decoding="async"
                onLoad={() => handleImageLoad(currentImageUrl)}
                onError={() => handleImageError(currentImageUrl)}
              />
            ) : null}
          </div>
        </button>
      </div>

      <div className="product-card__content">
        <h3 className="product-card__title">
          <button type="button" onClick={() => onViewDetails?.(activeProduct)}>
            {productData.name}
          </button>
        </h3>

        <p className="product-card__price-line">
          <MoneyXaf value={productData.price} />
        </p>

        <div className="product-card__pills">
          <span className="product-card__pill">{productData.specs.capacity}</span>
          {batteryHealthLabel ? (
            <span className="product-card__pill">Battery {batteryHealthLabel}</span>
          ) : null}
          {hasColorChoice ? (
            <select
              className="product-card__pill product-card__pill--select"
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              aria-label={`Color for ${productData.name}`}
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
            <span className="product-card__pill">{productData.specs.color}</span>
          )}
          <span className="product-card__pill">{productData.specs.country}</span>
        </div>

        <div className="product-card__stock-row">
          <span className="product-card__stock-label">{stockLabel}</span>
          {!isOutOfStock ? (
            <span className="product-card__stock-qty">{unitLabel}</span>
          ) : null}
        </div>

        {!isOutOfStock && belowMinBuyStock ? (
          <p className="product-card__min-buy-note" role="status">
            Only {productData.stock} in stock — buy unavailable; you can still make an offer.
          </p>
        ) : null}

        {!isOutOfStock && !belowMinBuyStock ? (
          <div className="product-card__quantity-row">
            <span className="product-card__quantity-label">Quantity</span>
            <div className="quantity-control">
              <button
                type="button"
                className="qty-btn"
                onClick={() => handleQuantityChange(quantity - 1)}
                disabled={quantity <= MIN_BUY_QUANTITY}
              >
                −
              </button>
              <span className="qty-value">{quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => handleQuantityChange(quantity + 1)}
                disabled={productData.stock > 0 ? quantity >= productData.stock : false}
              >
                +
              </button>
            </div>
          </div>
        ) : null}

        <div className="product-card__action-stack">
          <button
            type="button"
            className={`btn btn--buy btn--buy-primary${buyNowLoading ? ' btn--buy--loading' : ''}`}
            onClick={() => onBuyRequest?.(activeProduct, quantity)}
            disabled={isOutOfStock || buyNowLoading || belowMinBuyStock}
            aria-busy={buyNowLoading}
          >
            {buyNowLoading ? 'Sending…' : 'Buy Now'}
          </button>

          {!isOutOfStock ? (
            <div className="product-card__secondary-actions">
              <button type="button" className="btn btn--offer" onClick={openOfferModal}>
                Make Offer
              </button>
              <button
                type="button"
                className={`btn btn--cart${cartAnimating ? ' btn--cart--loading' : ''}`}
                onClick={handleAddToCart}
                disabled={cartAnimating || belowMinBuyStock}
              >
                {cartAnimating ? 'Adding…' : 'Add to Cart'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn--preorder btn--preorder-full"
              onClick={() => onOpenPreorder?.(activeProduct)}
              disabled={!canOpenPreorder || !onOpenPreorder}
            >
              Request preorder
            </button>
          )}
        </div>

        {cartAddedMsg ? (
          <div className="success-toast">
            <span>Added to cart successfully!</span>
          </div>
        ) : null}

        <p className="product-card__footer-note">
          Minimum {MIN_BUY_QUANTITY} unit{MIN_BUY_QUANTITY === 1 ? '' : 's'} per order
        </p>
      </div>

      {/* Enhanced Offer Modal */}
      {offerOpen && (
        canUsePortal ? 
        createPortal(
          <OfferModal
            product={productData}
            listPrice={listPrice}
            stock={productData.stock}
            onClose={closeOfferModal}
            onSubmit={handleOfferSubmit}
            onAddToCart={handleOfferAddToCart}
          />, 
          document.body
        ) : (
          <OfferModal
            product={productData}
            listPrice={listPrice}
            stock={productData.stock}
            onClose={closeOfferModal}
            onSubmit={handleOfferSubmit}
            onAddToCart={handleOfferAddToCart}
          />
        )
      )}

      {imagePreviewOpen && (
        <div className="product-image-modal-overlay" role="presentation" onClick={() => setImagePreviewOpen(false)}>
          <div
            className="product-image-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Image preview for ${productData.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="product-image-modal__close"
              aria-label="Close image preview"
              onClick={() => setImagePreviewOpen(false)}
            >
              ×
            </button>

            {imageCount > 1 && (
              <>
                <button
                  type="button"
                  className="product-image-modal__nav product-image-modal__nav--prev"
                  onClick={() => goImage(imageIndex - 1)}
                  aria-label="Previous image"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="product-image-modal__nav product-image-modal__nav--next"
                  onClick={() => goImage(imageIndex + 1)}
                  aria-label="Next image"
                >
                  ›
                </button>
              </>
            )}

            <img
              src={productData.images.all[imageIndex] || currentImageUrl}
              alt={productData.name}
              className="product-image-modal__img"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      )}
    </div>
  );
}