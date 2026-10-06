const crypto = require('crypto');
const express = require('express');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');
const { applyCoupon } = require('../utils/coupons');

const router = express.Router();

const PAYMENT_METHODS = ['cod', 'bkash', 'nagad', 'card'];
const MAX_QTY_PER_ITEM = 10;
const MAX_LINES = 20;

// Same price rule as the products and cart APIs.
const FINAL_PRICE = `(CASE
    WHEN p.discount_price IS NOT NULL
         AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
    THEN p.discount_price
    ELSE p.price
  END)`;

const round2 = (n) => Math.round(n * 100) / 100;

// Accepts 01712345678, +8801712345678, 8801712-345678 ... and returns 01712345678.
function normalizePhone(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  const match = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return match ? match[1] : null;
}

// Example: VX261005-K7P2QM  (VX + yymmdd + 6 random characters)
function generateOrderNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const now = new Date();
  const yymmdd =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += chars[crypto.randomInt(chars.length)];
  }
  return `VX${yymmdd}-${suffix}`;
}

function readCustomer(body) {
  const name = String(body.customer_name || '').trim();
  const phone = normalizePhone(body.phone);
  const email = String(body.email || '').trim();
  const district = String(body.district || '').trim();
  const address = String(body.shipping_address || '').trim();
  const note = String(body.note || '').trim();

  if (name.length < 2 || name.length > 120) {
    throw new HttpError(400, 'Please enter your name (2 to 120 characters)');
  }
  if (!phone) {
    throw new HttpError(400, 'Please enter a valid mobile number, like 01712345678');
  }
  if (email && (email.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new HttpError(400, 'Please enter a valid email address');
  }
  if (!district || district.length > 80) {
    throw new HttpError(400, 'Please enter your district');
  }
  if (address.length < 5) {
    throw new HttpError(400, 'Please enter your full delivery address');
  }
  if (!PAYMENT_METHODS.includes(body.payment_method)) {
    throw new HttpError(400, `payment_method must be one of: ${PAYMENT_METHODS.join(', ')}`);
  }

  return {
    name,
    phone,
    email: email || null,
    district,
    address,
    note: note || null,
    paymentMethod: body.payment_method,
  };
}

// "Buy now": the request can carry its own items instead of using the cart.
// Returns null when no items were sent (then the cart is used).
function readRequestedLines(body) {
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return null;
  }
  if (body.items.length > MAX_LINES) {
    throw new HttpError(400, `You can order at most ${MAX_LINES} different items at once`);
  }

  const merged = new Map();
  body.items.forEach((item) => {
    const variantId = Number(item.variant_id);
    const quantity = Number(item.quantity === undefined ? 1 : item.quantity);
    if (!Number.isInteger(variantId) || variantId < 1 || !Number.isInteger(quantity) || quantity < 1) {
      throw new HttpError(400, 'Each item needs a valid variant_id and quantity');
    }
    merged.set(variantId, (merged.get(variantId) || 0) + quantity);
  });

  return [...merged].map(([variant_id, quantity]) => {
    if (quantity > MAX_QTY_PER_ITEM) {
      throw new HttpError(400, `You can order at most ${MAX_QTY_PER_ITEM} of one item`);
    }
    return { variant_id, quantity };
  });
}

// POST /api/orders   (guest checkout, no login needed)
// Body: customer_name, phone, email?, district, shipping_address, note?,
//       payment_method, delivery_zone_id, coupon_code?, items? (for Buy now)
// Without "items" the order is made from the cart (x-session-id header).
router.post('/', async (req, res) => {
  const client = await pool.connect();

  try {
    const customer = readCustomer(req.body);

    const zoneId = Number(req.body.delivery_zone_id);
    if (!Number.isInteger(zoneId) || zoneId < 1) {
      throw new HttpError(400, 'delivery_zone_id is required');
    }

    const sessionId = req.get('x-session-id');
    let lines = readRequestedLines(req.body);
    const usingCart = lines === null;

    if (usingCart) {
      if (!sessionId) {
        throw new HttpError(400, 'x-session-id header is required to check out the cart');
      }
      const cartResult = await client.query(
        'SELECT variant_id, quantity FROM cart_items WHERE session_id = $1',
        [sessionId]
      );
      lines = cartResult.rows;
      if (lines.length === 0) {
        throw new HttpError(400, 'Your cart is empty');
      }
    }

    await client.query('BEGIN');

    // Lock these variants so two people cannot buy the last piece at the same time.
    const variantResult = await client.query(
      `SELECT v.id, v.size, v.color, v.stock, p.name, p.is_active,
              COALESCE(v.price_override, ${FINAL_PRICE})::float AS unit_price
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE v.id = ANY($1::int[])
       ORDER BY v.id
       FOR UPDATE OF v`,
      [lines.map((line) => line.variant_id)]
    );
    const variants = new Map(variantResult.rows.map((row) => [row.id, row]));

    // Prices always come from the database, never from the request.
    let subtotal = 0;
    const orderLines = lines.map((line) => {
      const variant = variants.get(line.variant_id);
      if (!variant || !variant.is_active) {
        throw new HttpError(400, 'Some items in your order are no longer available');
      }
      if (line.quantity > variant.stock) {
        throw new HttpError(
          400,
          `Not enough stock for ${variant.name} (${variant.size}/${variant.color})`,
          { available: variant.stock }
        );
      }
      const lineTotal = round2(variant.unit_price * line.quantity);
      subtotal += lineTotal;
      return {
        variant_id: variant.id,
        product_name: variant.name,
        size: variant.size,
        color: variant.color,
        price: variant.unit_price,
        quantity: line.quantity,
        line_total: lineTotal,
      };
    });
    subtotal = round2(subtotal);

    const zoneResult = await client.query(
      'SELECT id, name, charge::float AS charge FROM delivery_zones WHERE id = $1 AND is_active = TRUE',
      [zoneId]
    );
    if (zoneResult.rows.length === 0) {
      throw new HttpError(400, 'Invalid delivery zone');
    }
    const deliveryCharge = zoneResult.rows[0].charge;

    let discount = 0;
    let couponCode = null;
    if (req.body.coupon_code) {
      const applied = await applyCoupon(client, req.body.coupon_code, subtotal);
      discount = applied.discount;
      couponCode = applied.code;
    }

    const total = round2(subtotal + deliveryCharge - discount);

    const orderResult = await client.query(
      `INSERT INTO orders
         (order_number, customer_name, phone, email, district, shipping_address, note,
          subtotal, delivery_charge, discount, total, coupon_code, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, order_number, payment_status, order_status, created_at`,
      [
        generateOrderNumber(),
        customer.name,
        customer.phone,
        customer.email,
        customer.district,
        customer.address,
        customer.note,
        subtotal,
        deliveryCharge,
        discount,
        total,
        couponCode,
        customer.paymentMethod,
      ]
    );
    const order = orderResult.rows[0];

    for (const line of orderLines) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, product_name, size, color, price, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [order.id, line.variant_id, line.product_name, line.size, line.color, line.price, line.quantity]
      );
      await client.query('UPDATE product_variants SET stock = stock - $1 WHERE id = $2', [
        line.quantity,
        line.variant_id,
      ]);
    }

    if (usingCart) {
      await client.query('DELETE FROM cart_items WHERE session_id = $1', [sessionId]);
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Order placed successfully',
      order: {
        order_number: order.order_number,
        order_status: order.order_status,
        payment_method: customer.paymentMethod,
        payment_status: order.payment_status,
        customer_name: customer.name,
        phone: customer.phone,
        district: customer.district,
        shipping_address: customer.address,
        subtotal,
        delivery_charge: deliveryCharge,
        discount,
        coupon_code: couponCode,
        total,
        created_at: order.created_at,
        items: orderLines,
      },
    });
  } catch (err) {
    // Any failure undoes everything: no half-made order, no stock taken.
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Create order error:');
  } finally {
    client.release();
  }
});

// GET /api/orders/track?order_number=VX261005-K7P2QM&phone=01712345678
// Order tracking without an account: the order number and phone must both match.
router.get('/track', async (req, res) => {
  try {
    const orderNumber = String(req.query.order_number || '').trim();
    const phone = normalizePhone(req.query.phone);

    if (!orderNumber || !phone) {
      throw new HttpError(400, 'order_number and a valid phone number are required');
    }

    const orderResult = await pool.query(
      `SELECT id, order_number, customer_name, phone, district, shipping_address,
              subtotal::float AS subtotal,
              delivery_charge::float AS delivery_charge,
              discount::float AS discount,
              total::float AS total,
              coupon_code, payment_method, payment_status, order_status, created_at
       FROM orders
       WHERE upper(order_number) = upper($1) AND phone = $2`,
      [orderNumber, phone]
    );

    if (orderResult.rows.length === 0) {
      throw new HttpError(404, 'Order not found. Please check your order number and phone number.');
    }

    const { id, ...order } = orderResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT product_name, size, color, price::float AS price, quantity
       FROM order_items
       WHERE order_id = $1
       ORDER BY id`,
      [id]
    );

    res.json({ ...order, items: itemsResult.rows });
  } catch (err) {
    sendError(res, err, 'Track order error:');
  }
});

module.exports = router;
