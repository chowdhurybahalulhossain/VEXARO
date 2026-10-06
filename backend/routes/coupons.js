const express = require('express');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');
const { applyCoupon } = require('../utils/coupons');

const router = express.Router();

// POST /api/coupons/validate   body: { "code": "WELCOME10", "subtotal": 1100 }
// Lets the cart page show the discount before the customer places the order.
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;
    const subtotal = Number(req.body.subtotal);

    if (!code || Number.isNaN(subtotal) || subtotal < 0) {
      throw new HttpError(400, 'code and subtotal are required');
    }

    const applied = await applyCoupon(pool, code, subtotal);

    res.json({
      valid: true,
      code: applied.code,
      discount: applied.discount,
      subtotal_after_discount: Math.round((subtotal - applied.discount) * 100) / 100,
    });
  } catch (err) {
    sendError(res, err, 'Coupon validate error:');
  }
});

module.exports = router;
