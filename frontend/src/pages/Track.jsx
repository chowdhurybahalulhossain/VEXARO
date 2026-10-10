import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { formatPrice } from '../format.js';

const STEPS = [
  { key: 'pending', label: 'Order placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

const PAYMENT_LABELS = {
  cod: 'Cash on delivery',
  bkash: 'bKash',
  nagad: 'Nagad',
  card: 'Card',
};

async function lookup(orderNumber, phone) {
  const query = new URLSearchParams({ order_number: orderNumber, phone });
  return api(`/orders/track?${query.toString()}`);
}

export default function Track() {
  // The success page links here with the number and phone already filled in.
  const [params] = useSearchParams();
  const startNumber = params.get('order_number') || '';
  const startPhone = params.get('phone') || '';

  const [orderNumber, setOrderNumber] = useState(startNumber);
  const [phone, setPhone] = useState(startPhone);
  const [state, setState] = useState({ order: null, error: '', loading: false });

  async function search(number, phoneValue) {
    setState({ order: null, error: '', loading: true });
    try {
      const order = await lookup(number.trim(), phoneValue.trim());
      setState({ order, error: '', loading: false });
    } catch (err) {
      setState({ order: null, error: err.message, loading: false });
    }
  }

  useEffect(() => {
    if (startNumber && startPhone) {
      search(startNumber, startPhone);
    }
    // Only on the first load: later searches come from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    search(orderNumber, phone);
  }

  const { order, error, loading } = state;
  const stepIndex = order ? STEPS.findIndex((step) => step.key === order.order_status) : -1;

  return (
    <div className="page">
      <h1 className="page__title">Track your order</h1>
      <p className="muted track__intro">
        Enter the order number you got after checkout and the mobile number you used.
      </p>

      <form className="track-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="order_number">Order number</label>
          <input
            id="order_number"
            type="text"
            required
            placeholder="VX261010-ABC123"
            autoCapitalize="characters"
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="track_phone">Mobile number</label>
          <input
            id="track_phone"
            type="tel"
            inputMode="tel"
            required
            placeholder="01712345678"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Searching...' : 'Track order'}
        </button>
      </form>

      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      {order && (
        <section className="tracked" aria-label="Order details">
          <h2 className="tracked__number">{order.order_number}</h2>
          <p className="muted">
            Placed on {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {stepIndex >= 0 ? (
            <ol className="steps">
              {STEPS.map((step, index) => (
                <li
                  key={step.key}
                  className={`step${index <= stepIndex ? ' step--done' : ''}`}
                  aria-current={index === stepIndex ? 'step' : undefined}
                >
                  {step.label}
                </li>
              ))}
            </ol>
          ) : (
            <p className="notice">
              {order.order_status === 'cancelled' ? 'This order was cancelled.' : 'This order was returned.'}
            </p>
          )}

          <ul className="order-lines">
            {order.items.map((item, index) => (
              <li key={index}>
                <span>
                  {item.product_name}
                  {[item.size, item.color].some(Boolean) ? ` (${[item.size, item.color].filter(Boolean).join(' / ')})` : ''}
                  {' x '}
                  {item.quantity}
                </span>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>

          <p className="summary__row">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal)}</span>
          </p>
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
            Payment: {PAYMENT_LABELS[order.payment_method] || order.payment_method},{' '}
            {order.payment_status === 'paid' ? 'paid' : 'not paid yet'}
          </p>
          <p className="muted success__meta">
            Delivering to: {order.shipping_address}, {order.district}
          </p>
        </section>
      )}
    </div>
  );
}
