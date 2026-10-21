/** Cross-tab / same-window signal when a wholesaler order is created successfully */
const BROADCAST_CHANNEL = 'wache_order_created_v1';

/**
 * @param {'buy' | 'offer' | 'preorder' | string} orderType
 */
export function emitOrderCreated(orderType) {
  const ot = String(orderType || '').toLowerCase();
  if (ot !== 'buy' && ot !== 'offer' && ot !== 'preorder') return;
  try {
    window.dispatchEvent(new CustomEvent('wache:order-created', { detail: { orderType: ot } }));
  } catch {
    /* ignore */
  }
  try {
    const bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.postMessage({ orderType: ot });
    bc.close();
  } catch {
    /* ignore */
  }
}

/**
 * @param {(orderType: 'buy' | 'offer' | 'preorder') => void} handler
 * @returns {() => void} unsubscribe
 */
export function subscribeOrderCreated(handler) {
  const onWindow = (e) => {
    const ot = e?.detail?.orderType;
    if (ot === 'buy' || ot === 'offer' || ot === 'preorder') handler(ot);
  };
  window.addEventListener('wache:order-created', onWindow);

  let bc;
  try {
    bc = new BroadcastChannel(BROADCAST_CHANNEL);
    bc.onmessage = (ev) => {
      const ot = ev?.data?.orderType;
      if (ot === 'buy' || ot === 'offer' || ot === 'preorder') handler(ot);
    };
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener('wache:order-created', onWindow);
    try {
      bc?.close();
    } catch {
      /* ignore */
    }
  };
}
