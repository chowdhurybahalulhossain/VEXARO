import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext.js';
import { formatPrice } from '../format.js';

const MAX_PER_ORDER = 10;

export default function Cart() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState('');

  // Runs one change (quantity or remove) and shows the server's message if it is refused.
  async function run(itemId, action) {
    setBusyId(itemId);
    setMessage('');
    try {
      await action();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <p className="muted">Loading your cart...</p>
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="page">
        <h1 className="page__title">Your cart is empty</h1>
        <p className="muted">Add something you like and it will show up here.</p>
        <p className="page__action">
          <Link to="/shop" className="btn">
            Continue shopping
          </Link>
        </p>
      </div>
    );
  }

  // If stock dropped after an item was added, checkout is blocked until the cart is fixed.
  const blocked = cart.items.some((item) => !item.in_stock);

  return (
    <div className="page">
      <h1 className="page__title">Your cart</h1>

      <div className="cart">
        <ul className="cart-lines">
          {cart.items.map((item) => {
            const busy = busyId === item.id;
            const maxQuantity = Math.max(1, Math.min(item.stock, MAX_PER_ORDER));

            return (
              <li key={item.id} className="cart-line">
                <Link to={`/product/${item.slug}`} className="cart-line__image">
                  {item.image && <img src={item.image} alt={item.name} width="120" height="160" />}
                </Link>

                <div>
                  <Link to={`/product/${item.slug}`} className="cart-line__name">
                    {item.name}
                  </Link>
                  <p className="cart-line__variant">
                    {[item.size, item.color].filter(Boolean).join(' / ')}
                  </p>
                  <p className="cart-line__variant">{formatPrice(item.unit_price)} each</p>

                  {!item.in_stock && (
                    <p className="cart-line__warn">
                      {item.stock === 0
                        ? 'This item is out of stock now. Please remove it to continue.'
                        : `Only ${item.stock} left. Please lower the quantity.`}
                    </p>
                  )}

                  <div className="cart-line__row">
                    <div className="qty">
                      <button
                        type="button"
                        aria-label={`Decrease quantity of ${item.name}`}
                        disabled={busy || item.quantity <= 1}
                        onClick={() => run(item.id, () => updateItem(item.id, item.quantity - 1))}
                      >
                        -
                      </button>
                      <output aria-live="polite">{item.quantity}</output>
                      <button
                        type="button"
                        aria-label={`Increase quantity of ${item.name}`}
                        disabled={busy || item.quantity >= maxQuantity}
                        onClick={() => run(item.id, () => updateItem(item.id, item.quantity + 1))}
                      >
                        +
                      </button>
                    </div>

                    <p className="cart-line__total">{formatPrice(item.line_total)}</p>

                    <button
                      type="button"
                      className="link-button"
                      disabled={busy}
                      onClick={() => run(item.id, () => removeItem(item.id))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="summary" aria-label="Order summary">
          <h2>Order summary</h2>
          <p className="summary__row">
            <span>Subtotal ({cart.item_count} items)</span>
            <span>{formatPrice(cart.subtotal)}</span>
          </p>
          <p className="muted">Delivery charge and coupon are added at checkout.</p>

          {message && (
            <p className="notice" role="alert">
              {message}
            </p>
          )}

          <button type="button" className="btn" disabled={blocked} onClick={() => navigate('/checkout')}>
            Proceed to checkout
          </button>
          <p className="summary__link">
            <Link to="/shop">Continue shopping</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
