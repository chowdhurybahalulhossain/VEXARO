import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../hooks.js';
import { useCart } from '../cart/CartContext.js';
import { formatPrice } from '../format.js';
import { saveLastOrder } from '../lastOrder.js';
import { DISTRICTS } from '../data/districts.js';

const round2 = (number) => Math.round(number * 100) / 100;

// Dhaka district -> the "Inside Dhaka" zone, every other district -> "Outside Dhaka".
function suggestedZone(zones, district) {
  const pattern = district === 'Dhaka' ? /inside/i : /outside/i;
  return zones.find((zone) => pattern.test(zone.name)) || null;
}

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { cart, loading: cartLoading, refresh } = useCart();
  const { data: zonesData, error: zonesError } = useApi(() => api('/delivery-zones'), []);
  const zones = zonesData || [];

  // "Buy now" on a product page sends that one item here, so the cart stays untouched.
  const buyNow = location.state && location.state.buyNow ? location.state.buyNow : null;

  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    email: '',
    district: '',
    shipping_address: '',
    note: '',
  });
  const [zoneId, setZoneId] = useState(null);
  const [coupon, setCoupon] = useState({ input: '', applied: null, message: '', checking: false });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const lines = buyNow
    ? [
        {
          id: `buy-${buyNow.variant_id}`,
          name: buyNow.name,
          size: buyNow.size,
          color: buyNow.color,
          quantity: buyNow.quantity,
          unit_price: buyNow.unit_price,
          image: buyNow.image,
        },
      ]
    : cart.items;

  const subtotal = buyNow
    ? round2(buyNow.unit_price * buyNow.quantity)
    : cart.subtotal;
  const activeZone = zones.find((zone) => zone.id === zoneId) || null;
  const deliveryCharge = activeZone ? activeZone.charge : 0;
  const discount = coupon.applied ? coupon.applied.discount : 0;
  const total = round2(subtotal + deliveryCharge - discount);
  const stockProblem = !buyNow && cart.items.some((item) => !item.in_stock);

  function setField(name, value) {
    setForm((previous) => ({ ...previous, [name]: value }));
  }

  function handleDistrict(value) {
    setField('district', value);
    const zone = suggestedZone(zones, value);
    if (zone) setZoneId(zone.id);
  }

  async function applyCoupon() {
    const code = coupon.input.trim();
    if (!code) return;
    setCoupon((previous) => ({ ...previous, checking: true, message: '' }));
    try {
      const result = await api('/coupons/validate', { method: 'POST', body: { code, subtotal } });
      setCoupon({
        input: result.code,
        applied: { code: result.code, discount: result.discount },
        message: '',
        checking: false,
      });
    } catch (err) {
      setCoupon((previous) => ({ ...previous, applied: null, checking: false, message: err.message }));
    }
  }

  function removeCoupon() {
    setCoupon({ input: '', applied: null, message: '', checking: false });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    if (!activeZone) {
      setFormError('Please choose your delivery area.');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        ...form,
        payment_method: 'cod',
        delivery_zone_id: activeZone.id,
      };
      if (coupon.applied) body.coupon_code = coupon.applied.code;
      if (buyNow) body.items = [{ variant_id: buyNow.variant_id, quantity: buyNow.quantity }];

      const result = await api('/orders', { method: 'POST', body });

      saveLastOrder(result.order);
      await refresh(); // the backend emptied the cart if it was used
      navigate('/order/success', { replace: true, state: { order: result.order } });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!buyNow && cartLoading) {
    return (
      <div className="page">
        <p className="muted">Loading...</p>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="page">
        <h1 className="page__title">Nothing to check out</h1>
        <p className="muted">Your cart is empty.</p>
        <p className="page__action">
          <Link to="/shop" className="btn">
            Continue shopping
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Checkout</h1>
      {buyNow && (
        <p className="muted checkout__note">
          You are buying only this item. Your cart is not changed.
        </p>
      )}

      <div className="checkout">
        <form id="checkout-form" onSubmit={handleSubmit}>
          <fieldset className="form-section">
            <legend>Your details</legend>

            <div className="field">
              <label htmlFor="customer_name">Full name</label>
              <input
                id="customer_name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                autoComplete="name"
                value={form.customer_name}
                onChange={(event) => setField('customer_name', event.target.value)}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="phone">Mobile number</label>
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  required
                  autoComplete="tel"
                  placeholder="01712345678"
                  pattern="(\+?88)?01[3-9][0-9]{8}"
                  title="A Bangladeshi mobile number, like 01712345678"
                  value={form.phone}
                  onChange={(event) => setField('phone', event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="email">Email (optional)</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => setField('email', event.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Delivery address</legend>

            <div className="field">
              <label htmlFor="district">District</label>
              <select
                id="district"
                required
                value={form.district}
                onChange={(event) => handleDistrict(event.target.value)}
              >
                <option value="">Select your district</option>
                {DISTRICTS.map((district) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="shipping_address">Full address</label>
              <textarea
                id="shipping_address"
                required
                minLength={5}
                rows={3}
                autoComplete="street-address"
                placeholder="House, road, area, thana"
                value={form.shipping_address}
                onChange={(event) => setField('shipping_address', event.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="note">Note for delivery (optional)</label>
              <textarea
                id="note"
                rows={2}
                value={form.note}
                onChange={(event) => setField('note', event.target.value)}
              />
            </div>
          </fieldset>

          <fieldset className="form-section">
            <legend>Delivery area</legend>
            {zonesError && <p className="notice">Could not load delivery areas. {zonesError.message}</p>}
            {zones.map((zone) => (
              <label key={zone.id} className="radio-card">
                <input
                  type="radio"
                  name="zone"
                  value={zone.id}
                  required
                  checked={zoneId === zone.id}
                  onChange={() => setZoneId(zone.id)}
                />
                <span>{zone.name}</span>
                <span className="radio-card__price">{formatPrice(zone.charge)}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="form-section">
            <legend>Payment</legend>
            <div className="pay-box">
              <p>
                <strong>Cash on delivery</strong>
              </p>
              <p className="muted">Pay in cash when your order arrives.</p>
            </div>
            <p className="muted pay-note">bKash, Nagad and card payments are coming soon.</p>
          </fieldset>
        </form>

        <aside className="summary" aria-label="Order summary">
          <h2>Order summary</h2>

          <ul className="summary-items">
            {lines.map((line) => (
              <li key={line.id} className="summary-item">
                <div className="summary-item__image">
                  {line.image && <img src={line.image} alt="" width="84" height="112" />}
                </div>
                <div>
                  <p className="summary-item__name">{line.name}</p>
                  <p className="muted">
                    {[line.size, line.color].filter(Boolean).join(' / ')}
                    {[line.size, line.color].some(Boolean) ? ' · ' : ''}
                    Qty {line.quantity}
                  </p>
                </div>
                <p>{formatPrice(round2(line.unit_price * line.quantity))}</p>
              </li>
            ))}
          </ul>

          <div className="coupon">
            <input
              type="text"
              aria-label="Coupon code"
              placeholder="Coupon code"
              value={coupon.input}
              disabled={Boolean(coupon.applied)}
              onChange={(event) => setCoupon((previous) => ({ ...previous, input: event.target.value }))}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCoupon();
                }
              }}
            />
            {coupon.applied ? (
              <button type="button" className="btn btn--ghost" onClick={removeCoupon}>
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--ghost"
                disabled={coupon.checking || !coupon.input.trim()}
                onClick={applyCoupon}
              >
                {coupon.checking ? 'Checking...' : 'Apply'}
              </button>
            )}
          </div>
          {coupon.message && <p className="status status--error">{coupon.message}</p>}
          {coupon.applied && <p className="status status--ok">Coupon {coupon.applied.code} applied.</p>}

          <p className="summary__row">
            <span>Subtotal</span>
            <span>{formatPrice(subtotal)}</span>
          </p>
          <p className="summary__row">
            <span>Delivery</span>
            <span>{activeZone ? formatPrice(deliveryCharge) : 'Choose your area'}</span>
          </p>
          {discount > 0 && (
            <p className="summary__row summary__row--discount">
              <span>Discount</span>
              <span>-{formatPrice(discount)}</span>
            </p>
          )}
          <p className="summary__row summary__row--total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </p>

          {stockProblem && (
            <p className="notice" role="alert">
              Some items in your cart are out of stock. <Link to="/cart">Fix your cart</Link> to continue.
            </p>
          )}
          {formError && (
            <p className="notice" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            form="checkout-form"
            className="btn"
            disabled={submitting || stockProblem}
          >
            {submitting ? 'Placing order...' : 'Place order'}
          </button>
        </aside>
      </div>
    </div>
  );
}
