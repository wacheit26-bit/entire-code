import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import './AppDialog.css';

/**
 * Flexible modal shell — use AlertDialog / ConfirmDialog or pass children + footer.
 */
export function AppModal({
  open,
  title,
  children,
  footer,
  onClose,
  variant = 'default',
  wide = false,
  dialogClassName = '',
  closeOnBackdrop = true,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const vClass = variant === 'danger' ? 'app-dialog--danger' : 'app-dialog--default';

  return createPortal(
    <div className="app-dialog-root">
      <button
        type="button"
        className="app-dialog__backdrop"
        aria-label="Close dialog"
        onClick={() => closeOnBackdrop && onClose?.()}
      />
      <div
        className={['app-dialog', vClass, wide ? 'app-dialog--wide' : '', dialogClassName]
          .filter(Boolean)
          .join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="app-dialog__header">
          {title ? (
            <h2 id={titleId} className="app-dialog__title">
              {title}
            </h2>
          ) : (
            <span className="app-dialog__title" id={titleId} />
          )}
          <button type="button" className="app-dialog__close" onClick={() => onClose?.()} aria-label="Close">
            ×
          </button>
        </header>
        {children ? <div className="app-dialog__body">{children}</div> : null}
        {footer ? <footer className="app-dialog__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function AlertDialog({ open, title = 'Notice', message, confirmLabel = 'OK', onClose }) {
  return (
    <AppModal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <button type="button" className="app-dialog__btn app-dialog__btn--primary" onClick={() => onClose?.()}>
          {confirmLabel}
        </button>
      }
    >
      {typeof message === 'string' ? <p>{message}</p> : message}
    </AppModal>
  );
}

export function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) {
  return (
    <AppModal
      open={open}
      title={title}
      onClose={onCancel}
      variant={danger ? 'danger' : 'default'}
      footer={
        <>
          <button type="button" className="app-dialog__btn app-dialog__btn--ghost" onClick={() => onCancel?.()}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`app-dialog__btn ${danger ? 'app-dialog__btn--danger' : 'app-dialog__btn--primary'}`}
            onClick={() => onConfirm?.()}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {typeof message === 'string' ? <p>{message}</p> : message}
    </AppModal>
  );
}
