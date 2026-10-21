import { orderMatchesShop } from './orderDisplay';

export function filterOrdersForShop(orders, shop) {
  if (!shop) return orders;
  return (orders || []).filter((o) => orderMatchesShop(o, shop));
}
