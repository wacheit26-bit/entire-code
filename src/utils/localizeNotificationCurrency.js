import { formatMoneyXaf } from './formatMoneyXaf';

/**
 * Server notifications often embed USD-style amounts (`$500`, `Final price: $1,200`).
 * For wholesalers we display CFA (XAF) instead, without changing backend copy yet.
 */
export function localizeUsdAmountsInNotificationText(text) {
  if (text == null) return '';
  const s = String(text);
  return s.replace(/\$\s*([\d,]+(?:\.\d+)?)/g, (_, numStr) => {
    const n = parseFloat(String(numStr).replace(/,/g, ''));
    if (!Number.isFinite(n)) return `$${numStr}`;
    return formatMoneyXaf(n);
  });
}
