import { useEffect, useMemo, useState } from 'react';
import { formatProductName } from '../utils/formatProductName';
import { primaryProductImageUrl } from '../utils/productCatalogImage';
import './VendorShowcase.css';

const BANNER_ROTATE_INTERVALS_MS = [8 * 1000, 12 * 1000];
const MAX_BANNER_SLIDES = 10;

function productSlideKey(product) {
  return String(product?.__catalogKey ?? product?._id ?? product?.id ?? '');
}

function bannerRotateIntervalMs(slideIndex) {
  const safe = Math.max(0, Number(slideIndex) || 0);
  return BANNER_ROTATE_INTERVALS_MS[safe % BANNER_ROTATE_INTERVALS_MS.length];
}

function pickBannerSlides(products = [], sectionIndex = 0) {
  const list = (Array.isArray(products) ? products : []).filter((p) => primaryProductImageUrl(p));
  if (!list.length) return [];

  const offset = (Number(sectionIndex) || 0) % list.length;
  const rotated = [...list.slice(offset), ...list.slice(0, offset)];
  return rotated.slice(0, Math.min(MAX_BANNER_SLIDES, rotated.length));
}

export default function VendorCatalogBanner({
  products = [],
  sectionIndex = 0,
  title = 'Wholesale stock, ready to order',
}) {
  const bannerSlides = useMemo(
    () => pickBannerSlides(products, sectionIndex),
    [products, sectionIndex],
  );
  const [bannerIndex, setBannerIndex] = useState(0);
  const [bannerFadeIn, setBannerFadeIn] = useState(true);

  const bannerCount = bannerSlides.length;
  const safeBannerIndex = bannerCount ? bannerIndex % bannerCount : 0;
  const bannerProduct = bannerSlides[safeBannerIndex] || null;
  const bannerSlidesKey = useMemo(
    () => `${sectionIndex}:${bannerSlides.map(productSlideKey).join('|')}`,
    [bannerSlides, sectionIndex],
  );

  useEffect(() => {
    setBannerIndex(0);
    setBannerFadeIn(true);
  }, [bannerSlidesKey]);

  useEffect(() => {
    if (bannerCount <= 1) return undefined;

    const delayMs = bannerRotateIntervalMs(safeBannerIndex);
    let fadeTimer;
    const timer = window.setTimeout(() => {
      setBannerFadeIn(false);
      fadeTimer = window.setTimeout(() => {
        setBannerIndex((prev) => (prev + 1) % bannerCount);
        setBannerFadeIn(true);
      }, 320);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, [safeBannerIndex, bannerCount]);

  const bannerImage = bannerProduct ? primaryProductImageUrl(bannerProduct) : '';
  const bannerName = bannerProduct
    ? formatProductName(bannerProduct.product_name ?? bannerProduct.name ?? '')
    : '';

  if (!bannerImage) {
    return (
      <section
        className="vendor-split-banner vendor-split-banner--catalog"
        aria-labelledby={`vendor-catalog-banner-title-${sectionIndex}`}
      >
        <div className="vendor-split-banner__copy">
          <h2 id={`vendor-catalog-banner-title-${sectionIndex}`} className="vendor-split-banner__title">
            {title}
          </h2>
          <p className="vendor-split-banner__text">
            Browse verified inventory with vendor pricing, minimum order quantities, and fast fulfillment.
          </p>
        </div>
        <div className="vendor-split-banner__visual">
          <div className="vendor-split-banner__visual-fallback" aria-hidden />
        </div>
      </section>
    );
  }

  return (
    <section
      className="vendor-split-banner vendor-split-banner--catalog"
      aria-labelledby={`vendor-catalog-banner-title-${sectionIndex}`}
    >
      <div className="vendor-split-banner__copy">
        <h2 id={`vendor-catalog-banner-title-${sectionIndex}`} className="vendor-split-banner__title">
          {title}
        </h2>
        <p className="vendor-split-banner__text">
          {bannerName
            ? `Browse ${bannerName} and more — verified inventory with vendor pricing and fast fulfillment.`
            : 'Browse verified inventory with vendor pricing, minimum order quantities, and fast fulfillment.'}
        </p>
      </div>
      <div className="vendor-split-banner__visual">
        <img
          key={`${sectionIndex}-${safeBannerIndex}-${bannerImage}`}
          src={bannerImage}
          alt={bannerName || 'Featured wholesale product'}
          className={`vendor-split-banner__photo${bannerFadeIn ? ' vendor-split-banner__photo--visible' : ''}`}
          loading="lazy"
          decoding="async"
        />
        {bannerCount > 1 ? (
          <div className="vendor-split-banner__dots" aria-hidden>
            {bannerSlides.map((slide, index) => (
              <span
                key={productSlideKey(slide) || index}
                className={`vendor-split-banner__dot${index === safeBannerIndex ? ' is-active' : ''}`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
