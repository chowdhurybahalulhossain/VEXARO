const { HttpError } = require('./httpError');

// Checks a coupon code against the order subtotal and returns the discount amount.
// `db` can be the pool or a client that is inside a transaction.
async function applyCoupon(db, code, subtotal) {
  const result = await db.query(
    `SELECT code,
            discount_type,
            discount_value::float AS discount_value,
            min_order::float AS min_order
     FROM coupons
     WHERE upper(code) = upper($1)
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > now())`,
    [String(code).trim()]
  );

  if (result.rows.length === 0) {
    throw new HttpError(400, 'Invalid or expired coupon code');
  }

  const coupon = result.rows[0];

  if (subtotal < coupon.min_order) {
    throw new HttpError(400, `This coupon needs a minimum order of ${coupon.min_order}`, {
      min_order: coupon.min_order,
    });
  }

  let discount =
    coupon.discount_type === 'percent'
      ? (subtotal * coupon.discount_value) / 100
      : coupon.discount_value;

  // Never discount more than the order itself.
  discount = Math.min(Math.round(discount * 100) / 100, subtotal);

  return { code: coupon.code, discount };
}

module.exports = { applyCoupon };
