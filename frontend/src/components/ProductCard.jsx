import { Link } from 'react-router-dom';
import { formatPrice } from '../format.js';

const BADGE_LABELS = {
  best_selling: 'Best seller',
  new_arrival: 'New',
  offered: 'Offer',
};

export default function ProductCard({ product }) {
  const onSale = product.final_price < product.price;
  const percentOff = onSale ? Math.round((1 - product.final_price / product.price) * 100) : 0;
  const soldOut = product.total_stock === 0;

  return (
    <Link to={`/product/${product.slug}`} className="tile">
      <div className="tile__image">
        {product.image && (
          <img src={product.image} alt={product.name} width="600" height="800" loading="lazy" />
        )}
        {product.badge && (
          <span className={`tag tag--${product.badge}`}>{BADGE_LABELS[product.badge]}</span>
        )}
        {soldOut && <span className="tile__soldout">Sold out</span>}
      </div>

      <h3 className="tile__name">{product.name}</h3>

      <p className="tile__price">
        <span className="tile__now">{formatPrice(product.final_price)}</span>
        {onSale && (
          <>
            <s className="tile__was">{formatPrice(product.price)}</s>
            <span className="tile__off">{percentOff}% off</span>
          </>
        )}
      </p>
    </Link>
  );
}
