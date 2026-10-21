import './LoadingOverlay.css';
import BrandLogo from './BrandLogo';

export default function LoadingOverlay({
  show = false,
  ariaLabel = 'Loading',
  caption,
}) {
  if (!show) return null;

  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label={ariaLabel}>
      <div className="loading-overlay__inner">
        <BrandLogo className="loading-overlay__logo" alt="" />
        {caption ? <p className="loading-overlay__caption">{caption}</p> : null}
      </div>
    </div>
  );
}

