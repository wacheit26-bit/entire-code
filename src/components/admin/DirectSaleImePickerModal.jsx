import { useEffect, useMemo, useState } from 'react';
import { AppModal } from '../AppDialog';
import { availableImesForRow, productImeList, saleRowQuantity } from '../../utils/directSaleCart';
import './DirectSaleImePickerModal.css';

export default function DirectSaleImePickerModal({
  open,
  onClose,
  onApply,
  row,
  product,
  saleRows,
  imeColorByCode = {},
}) {
  const maxPick = saleRowQuantity(row);
  const options = useMemo(
    () => (product ? availableImesForRow(product, saleRows, row?.rowId) : []),
    [product, saleRows, row?.rowId],
  );
  const allProductImes = useMemo(() => (product ? productImeList(product) : []), [product]);

  const [draft, setDraft] = useState([]);

  useEffect(() => {
    if (!open) return;
    setDraft(Array.isArray(row?.selectedImes) ? [...row.selectedImes] : []);
  }, [open, row?.rowId, row?.selectedImes]);

  const toggle = (ime) => {
    setDraft((prev) => {
      if (prev.includes(ime)) return prev.filter((c) => c !== ime);
      if (prev.length >= maxPick) return prev;
      return [...prev, ime];
    });
  };

  const handleApply = () => {
    onApply?.(draft.filter(Boolean));
    onClose?.();
  };

  const productName = row?.productName || product?.product_name || 'Product';
  const hasImes = allProductImes.length > 0;

  return (
    <AppModal
      open={open}
      title={`Select IME — ${productName}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="admin-direct-sale-btn admin-direct-sale-btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-direct-sale-btn admin-direct-sale-btn--primary"
            disabled={!hasImes || draft.length !== maxPick}
            onClick={handleApply}
          >
            {hasImes ? `Apply (${draft.length}/${maxPick})` : 'Close'}
          </button>
        </>
      }
    >
      {!hasImes ? (
        <p className="direct-sale-ime-modal__empty">No IME available for this product.</p>
      ) : (
        <>
          <p className="direct-sale-ime-modal__lead">
            Check up to <strong>{maxPick}</strong> IME{maxPick === 1 ? '' : 's'} for this line. Selected units
            will be marked sold when the sale is completed.
          </p>
          <ul className="direct-sale-ime-modal__list">
            {options.map((ime) => {
              const checked = draft.includes(ime);
              const atMax = draft.length >= maxPick && !checked;
              const color = String(imeColorByCode?.[ime] || '').trim();
              return (
                <li key={ime}>
                  <label className={`direct-sale-ime-modal__item${checked ? ' is-checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atMax}
                      onChange={() => toggle(ime)}
                    />
                    <code>{ime}</code>
                    {color ? <span className="direct-sale-ime-modal__color">{color}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          {options.length === 0 ? (
            <p className="direct-sale-ime-modal__empty">
              All IMEs for this product are already selected on other rows.
            </p>
          ) : null}
        </>
      )}
    </AppModal>
  );
}
