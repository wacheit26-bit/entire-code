import './BrandLogo.css';

/** Public asset — not bundled (see `public/logo-240.jpg`, ~10KB vs 1.3MB PNG). */
export const BRAND_LOGO_SRC = '/logo-240.jpg';

/**
 * Shared brand mark for login, header, loading overlay, etc.
 * Uses a pre-compressed public JPEG so first paint is not blocked by a multi-MB PNG import.
 */
export default function BrandLogo({
  className = '',
  width = 120,
  height = 120,
  alt = 'Wache',
  priority = false,
}) {
  return (
    <span className="brand-logo">
      <img
        src={BRAND_LOGO_SRC}
        alt={alt}
        className={['brand-logo__img', className].filter(Boolean).join(' ')}
        width={width}
        height={height}
        decoding="async"
        {...(priority ? { fetchPriority: 'high' } : {})}
      />
    </span>
  );
}
