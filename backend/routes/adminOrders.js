const express = require('express');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');
const { readId } = require('../utils/validate');

// Mounted behind requireAuth + requireAdmin in server.js.
const router = express.Router();

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'];
const PAYMENT_STATUSES = ['unpaid', 'paid', 'failed', 'refunded'];

// Which status an order may move to from its current status.
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

// GET /api/admin/orders?status=&payment_status=&search=&page=&limit=
router.get('/orders', async (req, res) => {
  try {
    const { status, payment_status: paymentStatus } = req.query;
    const search = String(req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const where = [];
    const params = [];

    if (status) {
      if (!ORDER_STATUSES.includes(status)) {
        throw new HttpError(400, `status must be one of: ${ORDER_STATUSES.join(', ')}`);
      }
      params.push(status);
      where.push(`o.order_status = $${params.length}`);
    }
    if (paymentStatus) {
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        throw new HttpError(400, `payment_status must be one of: ${PAYMENT_STATUSES.join(', ')}`);
      }
      params.push(paymentStatus);
      where.push(`o.payment_status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const n = params.length;
      where.push(`(o.order_number ILIKE $${n} OR o.phone ILIKE $${n} OR o.customer_name ILIKE $${n})`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM orders o ${whereSql}`,
      params
    );
    const total = countResult.rows[0].total;

    const listResult = await pool.query(
      `SELECT o.id, o.order_number, o.customer_name, o.phone, o.district,
              o.total::float AS total, o.payment_method, o.payment_status,
              o.order_status, o.created_at,
              (SELECT COALESCE(SUM(quantity), 0)::int FROM order_items
                WHERE order_id = o.id) AS item_count
       FROM orders o
       ${whereSql}
       ORDER BY o.created_at DESC, o.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ page, limit, total, total_pages: Math.ceil(total / limit), orders: listResult.rows });
  } catch (err) {
    sendError(res, err, 'Admin order list error:');
  }
});

// GET /api/admin/orders/:id   ->  full order with its items
router.get('/orders/:id', async (req, res) => {
  try {
    const id = readId(req.params.id, 'order id');

    const orderResult = await pool.query(
      `SELECT id, order_number, user_id, customer_name, phone, email, district,
              shipping_address, note,
              subtotal::float AS subtotal,
              delivery_charge::float AS delivery_charge,
              discount::float AS discount,
              total::float AS total,
              coupon_code, payment_method, payment_status, order_status, created_at
       FROM orders WHERE id = $1`,
      [id]
    );
    if (orderResult.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }

    const itemsResult = await pool.query(
      `SELECT id, variant_id, product_name, size, color, price::float AS price, quantity
       FROM order_items WHERE order_id = $1 ORDER BY id`,
      [id]
    );

    res.json({ ...orderResult.rows[0], items: itemsResult.rows });
  } catch (err) {
    sendError(res, err, 'Admin order detail error:');
  }
});

// PATCH /api/admin/orders/:id/status   body: { order_status?, payment_status? }
// Cancelling or returning an order puts its items back into stock.
router.patch('/orders/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = readId(req.params.id, 'order id');
    const newStatus = req.body.order_status;
    const newPayment = req.body.payment_status;

    if (newStatus === undefined && newPayment === undefined) {
      throw new HttpError(400, 'Send order_status and/or payment_status');
    }
    if (newStatus !== undefined && !ORDER_STATUSES.includes(newStatus)) {
      throw new HttpError(400, `order_status must be one of: ${ORDER_STATUSES.join(', ')}`);
    }
    if (newPayment !== undefined && !PAYMENT_STATUSES.includes(newPayment)) {
      throw new HttpError(400, `payment_status must be one of: ${PAYMENT_STATUSES.join(', ')}`);
    }

    await client.query('BEGIN');

    // Lock the order row so the same order cannot be changed twice at once.
    const orderResult = await client.query(
      'SELECT order_status, payment_status, payment_method FROM orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (orderResult.rows.length === 0) {
      throw new HttpError(404, 'Order not found');
    }
    const order = orderResult.rows[0];

    let orderStatus = order.order_status;
    let paymentStatus = order.payment_status;

    if (newStatus !== undefined && newStatus !== order.order_status) {
      const allowed = TRANSITIONS[order.order_status];
      if (!allowed.includes(newStatus)) {
        throw new HttpError(
          400,
          `A ${order.order_status} order cannot be changed to ${newStatus}`,
          { allowed }
        );
      }
      orderStatus = newStatus;

      if (newStatus === 'cancelled' || newStatus === 'returned') {
        await client.query(
          `UPDATE product_variants v
           SET stock = v.stock + oi.quantity
           FROM order_items oi
           WHERE oi.order_id = $1 AND oi.variant_id = v.id`,
          [id]
        );
      }

      // Cash on delivery is collected when the parcel arrives.
      if (
        newStatus === 'delivered' &&
        order.payment_method === 'cod' &&
        order.payment_status === 'unpaid' &&
        newPayment === undefined
      ) {
        paymentStatus = 'paid';
      }
    }

    if (newPayment !== undefined) {
      paymentStatus = newPayment;
    }

    await client.query('UPDATE orders SET order_status = $1, payment_status = $2 WHERE id = $3', [
      orderStatus,
      paymentStatus,
      id,
    ]);

    await client.query('COMMIT');
    res.json({ id, order_status: orderStatus, payment_status: paymentStatus });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Update order status error:');
  } finally {
    client.release();
  }
});

module.exports = router;
