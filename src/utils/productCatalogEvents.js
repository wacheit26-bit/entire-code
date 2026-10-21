const PRODUCT_CATALOG_UPDATED_EVENT = 'wache:product-catalog-updated';
const PRODUCT_CATALOG_UPDATED_KEY = 'wache:product-catalog-updated-at';
const PRICING_CATALOG_OPTIONS_UPDATED_EVENT = 'wache:pricing-catalog-options-updated';
const PRICING_CATALOG_OPTIONS_UPDATED_KEY = 'wache:pricing-catalog-options-updated-at';

export function notifyProductCatalogUpdated() {
  const stamp = String(Date.now());
  try {
    window.localStorage.setItem(PRODUCT_CATALOG_UPDATED_KEY, stamp);
  } catch {
    /* ignore storage errors */
  }
  window.dispatchEvent(
    new CustomEvent(PRODUCT_CATALOG_UPDATED_EVENT, {
      detail: { at: stamp },
    }),
  );
}

export function notifyPricingCatalogOptionsUpdated() {
  const stamp = String(Date.now());
  try {
    window.localStorage.setItem(PRICING_CATALOG_OPTIONS_UPDATED_KEY, stamp);
  } catch {
    /* ignore storage errors */
  }
  window.dispatchEvent(
    new CustomEvent(PRICING_CATALOG_OPTIONS_UPDATED_EVENT, {
      detail: { at: stamp },
    }),
  );
}

export function subscribePricingCatalogOptionsUpdated(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return () => {};
  }

  const onUpdated = () => handler();
  const onStorage = (e) => {
    if (e.key === PRICING_CATALOG_OPTIONS_UPDATED_KEY && e.newValue) handler();
  };

  window.addEventListener(PRICING_CATALOG_OPTIONS_UPDATED_EVENT, onUpdated);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(PRICING_CATALOG_OPTIONS_UPDATED_EVENT, onUpdated);
    window.removeEventListener('storage', onStorage);
  };
}

export function subscribeProductCatalogUpdated(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return () => {};
  }

  const onUpdated = () => handler();
  const onStorage = (e) => {
    if (e.key === PRODUCT_CATALOG_UPDATED_KEY && e.newValue) handler();
  };

  window.addEventListener(PRODUCT_CATALOG_UPDATED_EVENT, onUpdated);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(PRODUCT_CATALOG_UPDATED_EVENT, onUpdated);
    window.removeEventListener('storage', onStorage);
  };
}
