/**
 * paybackend `createOrder` requires `Product.findById(productId)` to succeed.
 * For unlisted preorders we still send a real `productId`; display name and unit
 * price come from the preorder form. Resolution order:
 * 1. `VITE_PREORDER_PLACEHOLDER_PRODUCT_ID` in `.env`
 * 2. First catalog product whose name matches a known carrier hint
 * 3. First product in the loaded catalog (any row with a valid id)
 *
 * @see VITE_PREORDER_PLACEHOLDER_PRODUCT_ID in `.env` / Vite env
 */
export function getPreorderPlaceholderProductId() {
  return String(import.meta.env.VITE_PREORDER_PLACEHOLDER_PRODUCT_ID || '').trim();
}

/** Prefer an explicitly named carrier when env is unset. */
const CARRIER_NAME_HINTS = [
  'custom preorder',
  'preorder request',
  'preorder placeholder',
  'unlisted preorder',
  'generic preorder',
  'pre-order carrier',
];

function productDisplayName(p) {
  return String(p?.product_name ?? p?.name ?? '').trim();
}

function productStableId(p) {
  return String(p?._id ?? p?.id ?? '').trim();
}

/**
 * Mongo id used only to satisfy `Product.findById` for unlisted preorders.
 * @param {unknown[]} catalogProducts loaded storefront products
 * @returns {string} ObjectId string or ''
 */
export function resolvePreorderCarrierProductId(catalogProducts = []) {
  const fromEnv = getPreorderPlaceholderProductId();
  if (fromEnv) return fromEnv;

  const rows = Array.isArray(catalogProducts) ? catalogProducts : [];
  for (const p of rows) {
    const lower = productDisplayName(p).toLowerCase();
    if (!lower) continue;
    if (CARRIER_NAME_HINTS.some((hint) => lower.includes(hint))) {
      const id = productStableId(p);
      if (id) return id;
    }
  }
  for (const p of rows) {
    const id = productStableId(p);
    if (id) return id;
  }
  return '';
}

/** @deprecated Use {@link resolvePreorderCarrierProductId} */
export const resolvePreorderPlaceholderProductId = resolvePreorderCarrierProductId;
