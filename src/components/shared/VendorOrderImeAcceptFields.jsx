import { useEffect, useMemo, useState } from 'react';
import { fetchVendorOrderFulfillmentPreview } from '../../api/salesShopApi';
import { isVendorWebBuyOrder } from '../../utils/orderDisplay';

export default function VendorOrderImeAcceptFields({
  order,
  axiosPrivate,
  selectedImes,
  onSelectedImesChange,
  onRequiresImesChange,
  onCanFulfillChange,
  onShopProductChange,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const qty = Math.max(1, Number(order?.quantity) || 1);
  const assignedShopName = String(order?.directSale?.assignedWarehouseName || '').trim();
  const fulfillmentFallback = Boolean(order?.directSale?.fulfillmentFallback);
  const vendorCity = String(order?.directSale?.vendorCity || '').trim();
  const isVendorBuy = isVendorWebBuyOrder(order);

  const imeOptions = useMemo(
    () => (Array.isArray(preview?.imeOptions) ? preview.imeOptions : []),
    [preview],
  );
  const availableImes = useMemo(() => imeOptions.map((row) => row.ime), [imeOptions]);
  const requiresImes = Boolean(preview?.requiresImeAssignment);
  const canFulfillFromShop = preview ? Boolean(preview.canFulfillFromShop) : true;
  const productFoundInShop = preview ? Boolean(preview.productFoundInShop) : false;
  const availabilityElsewhere = useMemo(
    () => (Array.isArray(preview?.availabilityElsewhere) ? preview.availabilityElsewhere : []),
    [preview],
  );

  useEffect(() => {
    onRequiresImesChange?.(requiresImes);
  }, [requiresImes, onRequiresImesChange]);

  useEffect(() => {
    onCanFulfillChange?.(canFulfillFromShop && productFoundInShop);
  }, [canFulfillFromShop, productFoundInShop, onCanFulfillChange]);

  useEffect(() => {
    onShopProductChange?.(preview?.matchingLines?.[0] ?? null);
  }, [preview, onShopProductChange]);

  useEffect(() => {
    if (!order || !axiosPrivate || !isVendorBuy) {
      setPreview(null);
      setError('');
      return undefined;
    }

    const orderKey = String(order?._id ?? order?.id ?? '');
    if (!orderKey) return undefined;

    let cancelled = false;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const data = await fetchVendorOrderFulfillmentPreview(axiosPrivate, orderKey);
        if (!cancelled) {
          setPreview(data || null);
          if (!data?.productFoundInShop) {
            setError('No product in this shop matches the order name and capacity.');
          }
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err?.response?.data?.message || err?.message || 'Failed to load shop inventory.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order, axiosPrivate, isVendorBuy]);

  useEffect(() => {
    if (!requiresImes) {
      onSelectedImesChange?.([]);
    }
  }, [requiresImes, onSelectedImesChange]);

  if (!isVendorBuy) return null;

  const toggleIme = (ime) => {
    const list = Array.isArray(selectedImes) ? selectedImes : [];
    if (list.includes(ime)) {
      onSelectedImesChange?.(list.filter((code) => code !== ime));
      return;
    }
    if (list.length >= qty) return;
    onSelectedImesChange?.([...list, ime]);
  };

  const ref = preview?.orderReference;
  const matchLabel = ref?.productName
    ? `${ref.productName}${ref.capacity ? ` · ${ref.capacity}` : ''}`
    : 'Ordered product';

  return (
    <div className="vendor-order-ime-fields">
      <div className="vendor-order-ime-fields__shop">
        <strong>Fulfillment shop:</strong> {assignedShopName || preview?.shopName || 'Assigned shop'}
        {fulfillmentFallback ? (
          <span className="vendor-order-ime-fields__fallback">
            {' '}
            — routed to {assignedShopName || 'Yaounde'} (no shop in {vendorCity || 'vendor city'} yet)
          </span>
        ) : null}
      </div>

      {loading ? <p className="vendor-order-ime-fields__hint">Searching shop inventory…</p> : null}
      {error ? <p className="admin-orders-modal-error">{error}</p> : null}

      {!loading && preview?.productFoundInShop ? (
        <p className="vendor-order-ime-fields__match">
          Matched in shop by <strong>name + capacity</strong>: {matchLabel}
          {preview.matchingLineCount > 1
            ? ` (${preview.matchingLineCount} inventory lines, any color)`
            : ''}
        </p>
      ) : null}

      {!loading && preview && !canFulfillFromShop ? (
        <div className="vendor-order-ime-fields__warning" role="alert">
          <strong>Cannot fulfill from this shop.</strong>
          <p>
            Order quantity: <strong>{qty}</strong> — available in shop:{' '}
            <strong>{preview.tracksImes ? preview.shopAvailableImes : preview.shopStockUnits}</strong>
            {preview.shortage > 0 ? ` (short by ${preview.shortage})` : ''}.
          </p>
          <p>Request stock from a warehouse using General inventory before accepting this order.</p>
          {availabilityElsewhere.length ? (
            <>
              <p className="vendor-order-ime-fields__availability-lead">
                This model is also available in other areas:
              </p>
              <ul className="vendor-order-ime-fields__availability">
                {availabilityElsewhere.map((row) => (
                  <li key={row.key}>
                    <strong>{row.label}</strong>
                    {' — '}
                    {row.availableImes > 0
                      ? `${row.availableImes} IME${row.availableImes === 1 ? '' : 's'}`
                      : `${row.availableUnits} unit${row.availableUnits === 1 ? '' : 's'}`}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="vendor-order-ime-fields__hint">No other regional stock found for this model.</p>
          )}
        </div>
      ) : null}

      {requiresImes && canFulfillFromShop ? (
        <>
          <p className="vendor-order-ime-fields__lead">
            Assign exactly <strong>{qty}</strong> unsold IME{qty === 1 ? '' : 's'} from shop inventory.
          </p>
          <ul className="vendor-order-ime-fields__list">
            {imeOptions.map((row) => {
              const checked = (selectedImes || []).includes(row.ime);
              const atMax = (selectedImes || []).length >= qty && !checked;
              return (
                <li key={row.ime}>
                  <label className={`vendor-order-ime-fields__option${atMax ? ' is-disabled' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atMax}
                      onChange={() => toggleIme(row.ime)}
                    />
                    <code>{row.ime}</code>
                    {row.color ? <span className="vendor-order-ime-fields__color">{row.color}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="vendor-order-ime-fields__count">
            Selected {(selectedImes || []).length}/{qty}
          </p>
        </>
      ) : null}

      {!loading && preview && productFoundInShop && !requiresImes && canFulfillFromShop ? (
        <p className="vendor-order-ime-fields__hint">
          No registered IMEs on matching lines — confirm with an expected delivery date.
        </p>
      ) : null}
    </div>
  );
}
