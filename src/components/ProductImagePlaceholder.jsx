import { BRAND_LOGO_SRC } from './BrandLogo';
import { formatProductName, formatTitleCase } from '../utils/formatProductName';
import './ProductImagePlaceholder.css';

/**
 * Shown on the wholesaler storefront when a product has no uploaded photos yet.
 * Keeps the card layout intact without an empty or broken image area.
 */
export default function ProductImagePlaceholder({
  product,
  className = '',
  compact = false,
}) {
  const brand = formatTitleCase(product?.brand, '');
  const name = formatProductName(product?.product_name ?? product?.name ?? '');

  return (
    <div
      className={[
        'product-image-placeholder',
        compact ? 'product-image-placeholder--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      <img src={BRAND_LOGO_SRC} alt="" className="product-image-placeholder__logo" decoding="async" />
      {!compact && brand ? (
        <span className="product-image-placeholder__brand">{brand}</span>
      ) : null}
      {!compact && name ? (
        <span className="product-image-placeholder__name">{name}</span>
      ) : null}
    </div>
  );
}
