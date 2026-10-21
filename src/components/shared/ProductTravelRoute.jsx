import { productTravelRoute, isProductTravelling } from '../../utils/productTravelRoute';
import './ProductTravelRoute.css';

export default function ProductTravelRoute({ product, className = '' }) {
  if (!isProductTravelling(product)) return null;
  const route = productTravelRoute(product);
  if (!route) return null;

  return (
    <span
      className={`product-travel-route ${className}`.trim()}
      title={`From ${route.from} to ${route.to}`}
    >
      <span className="product-travel-route__from">{route.from}</span>
      <span className="product-travel-route__arrow" aria-hidden>
        →
      </span>
      <span className="product-travel-route__to">{route.to}</span>
    </span>
  );
}
