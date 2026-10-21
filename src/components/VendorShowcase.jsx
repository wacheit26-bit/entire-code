import { useEffect, useMemo, useState } from 'react';
import { formatProductName, formatTitleCase } from '../utils/formatProductName';
import { MIN_BUY_QUANTITY } from '../constants/wholesaleOrderLimits';
import { resolveVendorListingProduct } from '../utils/mergeCatalogProducts';
import { collectVendorShopImageUrls, productHasVendorShopCatalogImage } from '../utils/productCatalogImage';
import MoneyXaf from './MoneyXaf';
import './VendorShowcase.css';

/** Alternating hero dwell times: 3 min, 7 min, 3 min, 7 min, … */
const HERO_ROTATE_INTERVALS_MS = [3 * 60 * 1000, 7 * 60 * 1000];
const MAX_HERO_SLIDES = 8;
const FEATURED_GRID_SIZE = 4;

function rotateIntervalMs(slideIndex, intervals) {
  const safe = Math.max(0, Number(slideIndex) || 0);
  return intervals[safe % intervals.length];
}

function heroRotateIntervalMs(slideIndex) {
  return rotateIntervalMs(slideIndex, HERO_ROTATE_INTERVALS_MS);
}

function productSlideKey(product) {
  return String(product?.__catalogKey ?? product?._id ?? product?.id ?? '');
}
function productTimestamp(p) {
  const raw = p?.createdAt || p?.releaseDate || p?.releasedAt || p?.updatedAt || 0;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function pickFeaturedGridProducts(sorted, heroSlides) {
  const heroKeys = new Set(heroSlides.map(productSlideKey).filter(Boolean));
  const grid = sorted.filter((p) => !heroKeys.has(productSlideKey(p))).slice(0, FEATURED_GRID_SIZE);

  if (grid.length >= FEATURED_GRID_SIZE || sorted.length < FEATURED_GRID_SIZE) {
    return grid;
  }

  const usedKeys = new Set(grid.map((p) => productSlideKey(p)).filter(Boolean));
  for (const product of sorted) {
    if (grid.length >= FEATURED_GRID_SIZE) break;
    const key = productSlideKey(product);
    if (key && usedKeys.has(key)) continue;
    grid.push(product);
    if (key) usedKeys.add(key);
  }

  return grid;
}

function pickShowcaseProducts(products = []) {
  const list = Array.isArray(products) ? products : [];
  const withImages = list.filter((p) => productHasVendorShopCatalogImage(p));
  const sorted = [...withImages].sort((a, b) => productTimestamp(b) - productTimestamp(a));

  if (!sorted.length) {
    return { heroSlides: list[0] ? [list[0]] : [], grid: [] };
  }

  const heroSlides = sorted.slice(0, Math.min(MAX_HERO_SLIDES, sorted.length));
  const grid = pickFeaturedGridProducts(sorted, heroSlides);

  return { heroSlides, grid };
}
function heroStackImages(product) {
  if (!product) return [];

  const urls = [];
  const seen = new Set();
  const add = (url) => {
    const t = String(url || '').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    urls.push(t);
  };

  const variants = Array.isArray(product.__colorVariants) ? product.__colorVariants : [];
  if (variants.length > 1) {
    variants.slice(0, 3).forEach((variant) => {
      const resolved = resolveVendorListingProduct(product, variant.productId);
      add(collectVendorShopImageUrls(resolved)[0]);
    });
  }

  collectVendorShopImageUrls(product).forEach(add);
  return urls.slice(0, 3);
}

function ShowcaseProductCard({ product, onViewDetails, onBuyRequest, buyNowSubmittingProductId }) {
  if (!product) return null;

  const image = collectVendorShopImageUrls(product)[0] || '';
  const name = formatProductName(product.product_name ?? product.name ?? 'Product');
  const productId = String(product._id ?? product.id ?? '');
  const buyNowLoading = Boolean(buyNowSubmittingProductId && buyNowSubmittingProductId === productId);
  const stock = Number(product.stock) || 0;
  const belowMinBuy = stock > 0 && stock < MIN_BUY_QUANTITY;

  return (
    <article className="vendor-showcase-card">
      <h3 className="vendor-showcase-card__title">{name}</h3>
      <button
        type="button"
        className="vendor-showcase-card__image-btn"
        onClick={() => onViewDetails?.(product)}
        aria-label={`View ${name}`}
      >
        {image ? (
          <img src={image} alt="" className="vendor-showcase-card__image" loading="lazy" decoding="async" />
        ) : (
          <span className="vendor-showcase-card__placeholder" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className={`vendor-showcase-card__buy${buyNowLoading ? ' is-loading' : ''}`}
        onClick={() => onBuyRequest?.(product, MIN_BUY_QUANTITY)}
        disabled={stock <= 0 || buyNowLoading || belowMinBuy}
        aria-busy={buyNowLoading}
      >
        {buyNowLoading ? 'Sending…' : 'Buy'}
      </button>
    </article>
  );
}

export default function VendorShowcase({
  products = [],
  onViewDetails,
  onBuyRequest,
  buyNowSubmittingProductId = null,
}) {
  const { heroSlides, grid } = useMemo(() => pickShowcaseProducts(products), [products]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroFadeIn, setHeroFadeIn] = useState(true);

  const slideCount = heroSlides.length;
  const safeHeroIndex = slideCount ? heroIndex % slideCount : 0;
  const hero = heroSlides[safeHeroIndex] || null;
  const heroSlidesKey = useMemo(
    () => heroSlides.map(productSlideKey).join('|'),
    [heroSlides],
  );

  useEffect(() => {
    setHeroIndex(0);
    setHeroFadeIn(true);
  }, [heroSlidesKey]);

  useEffect(() => {
    if (slideCount <= 1) return undefined;

    const delayMs = heroRotateIntervalMs(safeHeroIndex);
    let fadeTimer;
    const timer = window.setTimeout(() => {
      setHeroFadeIn(false);
      fadeTimer = window.setTimeout(() => {
        setHeroIndex((prev) => (prev + 1) % slideCount);
        setHeroFadeIn(true);
      }, 320);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, [safeHeroIndex, slideCount]);

  const goToHeroSlide = (index) => {
    if (index < 0 || index >= slideCount || index === safeHeroIndex) return;
    setHeroFadeIn(false);
    window.setTimeout(() => {
      setHeroIndex(index);
      setHeroFadeIn(true);
    }, 220);
  };

  const heroImages = useMemo(() => heroStackImages(hero), [hero]);
  const heroName = hero ? formatProductName(hero.product_name ?? hero.name ?? 'Featured product') : '';
  const heroBrand = hero ? formatTitleCase(hero.brand, '') : '';
  const heroCapacity = hero ? String(hero.capacity || '').trim() : '';
  const heroStock = hero ? Number(hero.stock) || 0 : 0;
  const heroId = hero ? String(hero._id ?? hero.id ?? '') : '';
  const heroBuyLoading = Boolean(buyNowSubmittingProductId && buyNowSubmittingProductId === heroId);
  const heroBelowMin = heroStock > 0 && heroStock < MIN_BUY_QUANTITY;

  if (!hero && !grid.length) return null;

  return (
    <div className="vendor-showcase" aria-label="Featured wholesale highlights">
      {hero ? (
        <section className="vendor-hero" aria-labelledby="vendor-section-hero-title">
          <header className="vendor-section-head vendor-section-head--inset">
            <h2 id="vendor-section-hero-title" className="vendor-section-head__title">
              Wholesale spotlight
            </h2>
          </header>
          <div className={`vendor-hero__inner${heroFadeIn ? ' vendor-hero__inner--visible' : ''}`}>
            <div className="vendor-hero__visual">
              <div className="vendor-hero__stack" aria-hidden={heroImages.length <= 1}>
                {heroImages.length > 0 ? (
                  heroImages.map((url, index) => (
                    <img
                      key={`${safeHeroIndex}-${url}`}
                      src={url}
                      alt=""
                      className={`vendor-hero__stack-img vendor-hero__stack-img--${index + 1}`}
                      loading={index === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                    />
                  ))
                ) : (
                  <span className="vendor-hero__stack-placeholder" />
                )}
              </div>
            </div>

            <div className="vendor-hero__content">
              <p className="vendor-hero__eyebrow">Featured device</p>
              <h3 className="vendor-hero__title">{heroName}</h3>
              <p className="vendor-hero__tagline">
                {[heroBrand, heroCapacity].filter(Boolean).join(' · ') || 'Premium devices · Vendor pricing'}
                {hero?.price ? (
                  <>
                    {' · from '}
                    <MoneyXaf value={hero.price} />
                  </>
                ) : null}
              </p>
              <div className="vendor-hero__actions">
                <button
                  type="button"
                  className="vendor-hero__link"
                  onClick={() => onViewDetails?.(hero)}
                >
                  Learn more
                </button>
                <button
                  type="button"
                  className={`vendor-hero__buy${heroBuyLoading ? ' is-loading' : ''}`}
                  onClick={() => onBuyRequest?.(hero, MIN_BUY_QUANTITY)}
                  disabled={heroStock <= 0 || heroBuyLoading || heroBelowMin}
                  aria-busy={heroBuyLoading}
                >
                  {heroBuyLoading ? 'Sending…' : 'Buy'}
                </button>
              </div>

              {slideCount > 1 ? (
                <div
                  className="vendor-hero__dots"
                  role="tablist"
                  aria-label="Featured product slides"
                >
                  {heroSlides.map((slide, index) => (
                    <button
                      key={productSlideKey(slide) || index}
                      type="button"
                      role="tab"
                      className={`vendor-hero__dot${index === safeHeroIndex ? ' is-active' : ''}`}
                      aria-selected={index === safeHeroIndex}
                      aria-label={`Show ${formatProductName(slide.product_name ?? slide.name ?? 'product')} (${index + 1} of ${slideCount})`}
                      onClick={() => goToHeroSlide(index)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {grid.length > 0 ? (
        <section className="vendor-feature-grid" aria-labelledby="vendor-section-featured-title">
          <header className="vendor-section-head vendor-section-head--inset">
            <h2 id="vendor-section-featured-title" className="vendor-section-head__title">
              Featured products
            </h2>
          </header>
          <div className="vendor-feature-grid__track">
            {grid.map((product, index) => (
              <ShowcaseProductCard
                key={product.__catalogKey ?? product._id ?? product.id ?? index}
                product={product}
                onViewDetails={onViewDetails}
                onBuyRequest={onBuyRequest}
                buyNowSubmittingProductId={buyNowSubmittingProductId}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
