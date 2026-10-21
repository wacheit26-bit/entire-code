import { useEffect, useRef, useState } from 'react';

export default function LocationCardMenu({ onEdit, onDelete, label = 'Location options' }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (!wrapRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (action) => (event) => {
    event.stopPropagation();
    event.preventDefault();
    setOpen(false);
    action?.();
  };

  return (
    <div className="wh-location-card__menu-wrap" ref={wrapRef}>
      <button
        type="button"
        className="wh-location-card__menu-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
          <circle cx="12" cy="5" r="1.75" fill="currentColor" />
          <circle cx="12" cy="12" r="1.75" fill="currentColor" />
          <circle cx="12" cy="19" r="1.75" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="wh-location-card__menu" role="menu">
          <button type="button" role="menuitem" className="wh-location-card__menu-item" onClick={run(onEdit)}>
            Edit
          </button>
          <button
            type="button"
            role="menuitem"
            className="wh-location-card__menu-item wh-location-card__menu-item--danger"
            onClick={run(onDelete)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
