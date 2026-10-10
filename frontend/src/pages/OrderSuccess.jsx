import { Link, useLocation } from 'react-router-dom';
import { formatPrice } from '../format.js';
import { loadLastOrder } from '../lastOrder.js';

const PAYMENT_LABELS = {
  cod: 'Cash on delivery',
  bkash: 'bKash',
  nagad: 'Nagad',
  card: 'Card',
};

export default function OrderSuccess() {
  const location = useLocation();

  // Right after checkout the order comes through navigation; after a refresh it comes from the tab's storage.
  const order = (location.state && location.state.order) || loadLastOrder();

  if (!order) {
    return (
      <div className="page">
        <h1 className="page__title">No recent order found</h1>
        <p className="muted">If you placed an order, you can look it up with your order number.</p>
        <p className="page__action">
          <Link to="/track" className="btn">
            Track an order
          </Link>
        </p>
      </div>
    );
  }

  const trackLink = `/track?order_number=${encodeURIComponent(order.order_number)}&phone=${encodeURIComponent(order.phone)}`;

  return (
    <div className="page">
      <div className="success">
        <h1 className="page__title">Thank you, {order.customer_name}!</h1>
        <p>Your order has been placed. Keep this order number to track it:</p>
        <p className="success__number">{order.order_number}</p>

        <ul className="order-lines">
          {order.items.map((item) => (
            <li key={item.variant_id}>
              <span>
                {item.product_name}
                {[item.size, item.color].some(Boolean) ? ` (${[item.size, item.color].filter(Boolean).join(' / ')})` : ''}
                {' x '}
                {item.quantity}
              </span>
              <span>{formatPrice(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <p className="summary__row">
          <span>Delivery</span>
          <span>{formatPrice(order.delivery_charge)}</span>
        </p>
        {order.discount > 0 && (
          <p className="summary__row summary__row--discount">
            <span>Discount</span>
            <span>-{formatPrice(order.discount)}</span>
          </p>
        )}
        <p className="summary__row summary__row--total">
          <span>Total</span>
          <span>{formatPrice(order.total)}</span>
        </p>

        <p className="muted success__meta">
          Payment: {PAYMENT_LABELS[order.payment_method] || order.payment_method}
          {order.payment_method === 'cod' ? ' (pay when the order arrives)' : ''}
        </p>
        <p className="muted success__meta">
          Delivering to: {order.shipping_address}, {order.district}
        </p>

        <div className="actions">
          <Link to={trackLink} className="btn">
            Track this order
          </Link>
          <Link to="/shop" className="btn btn--ghost">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
