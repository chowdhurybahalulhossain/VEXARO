const express = require('express');
const pool = require('../db');
const { sendError } = require('../utils/httpError');

const router = express.Router();

// GET /api/delivery-zones  ->  e.g. Inside Dhaka / Outside Dhaka with their charges
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, charge::float AS charge
       FROM delivery_zones
       WHERE is_active = TRUE
       ORDER BY charge, id`
    );
    res.json(result.rows);
  } catch (err) {
    sendError(res, err, 'Delivery zones error:');
  }
});

module.exports = router;
