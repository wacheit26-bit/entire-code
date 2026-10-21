import { formatMoneyXaf } from './formatMoneyXaf';

export function formatProductPriceRange(product) {
  const min = Number(product?.priceMin);
  const max = Number(product?.priceMax);
  const hasMin = Number.isFinite(min) && min > 0;
  const hasMax = Number.isFinite(max) && max > 0;

  if (hasMin && hasMax) {
    if (min === max) return formatMoneyXaf(min);
    return `${formatMoneyXaf(min)} – ${formatMoneyXaf(max)}`;
  }
  if (hasMin) return `from ${formatMoneyXaf(min)}`;
  if (hasMax) return `up to ${formatMoneyXaf(max)}`;
  return '—';
}

export function productHasPriceRange(product) {
  const min = Number(product?.priceMin);
  const max = Number(product?.priceMax);
  return (
    (Number.isFinite(min) && min > 0) || (Number.isFinite(max) && max > 0)
  );
}
