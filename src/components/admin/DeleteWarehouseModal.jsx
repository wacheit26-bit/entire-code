import { useEffect, useMemo, useState } from 'react';
import { AppModal } from '../AppDialog';
import { deleteWarehouse, fetchWarehouseDeletePreview, warehouseId } from '../../api/warehouseApi';
import useAxiosPrivate from '../../hooks/useAxiosPrivate';
import { notifyProductCatalogUpdated } from '../../utils/productCatalogEvents';
import './WarehousesPanel.css';

function isMainWarehouse(loc) {
  const type = String(loc?.type || '').toLowerCase();
  return type === 'main' || loc?.isMain === true;
}

function warehouseOptionLabel(loc) {
  const city = loc?.city ? ` · ${loc.city}` : '';
  return `${loc?.name || 'Warehouse'}${city}`;
}

export default function DeleteWarehouseModal({
  warehouse,
  mainWarehouses = [],
  onClose,
  onDeleted,
}) {
  const axiosPrivate = useAxiosPrivate();
  const sourceId = warehouseId(warehouse);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState('');
  const [reassignToId, setReassignToId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const reassignmentOptions = useMemo(() => {
    return (mainWarehouses || [])
      .filter((loc) => isMainWarehouse(loc) && warehouseId(loc) && warehouseId(loc) !== sourceId)
      .sort((a, b) => {
        const ac = String(a?.city || '');
        const bc = String(b?.city || '');
        if (ac !== bc) return ac.localeCompare(bc);
        return String(a?.name || '').localeCompare(String(b?.name || ''));
      });
  }, [mainWarehouses, sourceId]);

  useEffect(() => {
    if (!sourceId) return undefined;
    let cancelled = false;
    (async () => {
      setPreviewLoading(true);
      setPreviewError('');
      try {
        const data = await fetchWarehouseDeletePreview(axiosPrivate, sourceId);
        if (!cancelled) setPreview(data);
      } catch (err) {
        if (!cancelled) {
          setPreviewError(err?.response?.data?.message || err?.message || 'Could not load delete details.');
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [axiosPrivate, sourceId]);

  useEffect(() => {
    if (!reassignmentOptions.length) {
      setReassignToId('');
      return;
    }
    setReassignToId((current) => {
      if (current && reassignmentOptions.some((loc) => warehouseId(loc) === current)) return current;
      return warehouseId(reassignmentOptions[0]);
    });
  }, [reassignmentOptions]);

  const productCount = Number(preview?.productCount) || 0;
  const stockAtLocation = Number(preview?.stockAtLocation) || 0;
  const legacyLinkedShops =
    Number(preview?.legacyLinkedShops ?? preview?.activeChildShops) || 0;
  const requiresReassignment = productCount > 0;
  const canSubmit =
    !previewLoading &&
    !previewError &&
    (!requiresReassignment || Boolean(reassignToId));

  const handleDelete = async () => {
    if (!sourceId || !canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await deleteWarehouse(axiosPrivate, sourceId, {
        reassignToWarehouseId: requiresReassignment ? reassignToId : undefined,
      });
      notifyProductCatalogUpdated();
      await onDeleted?.(res);
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Could not delete this location.');
    } finally {
      setSubmitting(false);
    }
  };

  const isMain = isMainWarehouse(warehouse);
  const deletingLabel = isMain ? 'main warehouse' : 'shop';

  return (
    <AppModal
      open={Boolean(warehouse)}
      title={isMain ? 'Delete main warehouse' : 'Delete shop'}
      onClose={() => !submitting && onClose?.()}
      variant="danger"
      wide
      footer={
        <>
          <button
            type="button"
            className="app-dialog__btn app-dialog__btn--ghost"
            disabled={submitting}
            onClick={() => onClose?.()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="app-dialog__btn app-dialog__btn--danger"
            disabled={submitting || !canSubmit}
            onClick={handleDelete}
          >
            {submitting ? 'Deleting…' : requiresReassignment ? 'Move products & delete' : 'Delete location'}
          </button>
        </>
      }
    >
      <p>
        You are about to delete <strong>{warehouse?.name}</strong>
        {warehouse?.city ? ` (${warehouse.city})` : ''}. Products are never deleted — when stock is linked
        here, choose another <strong>main warehouse</strong> to receive them.
      </p>

      {previewLoading ? <p className="wh-empty">Checking linked products…</p> : null}
      {previewError ? (
        <p className="wh-setup-alert wh-setup-alert--error" role="alert">
          {previewError}
        </p>
      ) : null}

      {!previewLoading && !previewError && preview ? (
        <div className="wh-delete-warehouse-preview">
          <ul className="wh-delete-warehouse-preview__stats">
            <li>
              <strong>{productCount}</strong> product record{productCount === 1 ? '' : 's'} linked
            </li>
            <li>
              <strong>{stockAtLocation}</strong> with stock physically at this {deletingLabel}
            </li>
            {isMain && legacyLinkedShops > 0 ? (
              <li>
                <strong>{legacyLinkedShops}</strong> shop{legacyLinkedShops === 1 ? '' : 's'} with an optional
                legacy link — they stay active and independent (e.g. a Bamenda shop without a Bamenda warehouse).
              </li>
            ) : null}
          </ul>

          {requiresReassignment ? (
            <label className="wh-setup-field wh-delete-warehouse-preview__select">
              <span>Send all products to warehouse</span>
              <select
                value={reassignToId}
                onChange={(e) => setReassignToId(e.target.value)}
                disabled={submitting || reassignmentOptions.length === 0}
              >
                {reassignmentOptions.length === 0 ? (
                  <option value="">No other main warehouse available</option>
                ) : (
                  reassignmentOptions.map((loc) => {
                    const id = warehouseId(loc);
                    return (
                      <option key={id} value={id}>
                        {warehouseOptionLabel(loc)}
                      </option>
                    );
                  })
                )}
              </select>
              {reassignmentOptions.length === 0 ? (
                <p className="wh-setup-alert wh-setup-alert--error" role="alert">
                  Create another main warehouse first, then you can move products and delete this one.
                </p>
              ) : null}
            </label>
          ) : (
            <p className="wh-delete-warehouse-preview__ok">No products are linked to this location. Safe to delete.</p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="wh-setup-alert wh-setup-alert--error" role="alert">
          {error}
        </p>
      ) : null}
    </AppModal>
  );
}
