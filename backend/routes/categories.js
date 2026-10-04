const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/categories  ->  parent categories with their children nested inside
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, parent_id, name, slug, image_url
       FROM categories
       WHERE is_active = TRUE
       ORDER BY sort_order, name`
    );

    const byId = {};
    result.rows.forEach((row) => {
      byId[row.id] = { ...row, children: [] };
    });

    const tree = [];
    result.rows.forEach((row) => {
      if (row.parent_id && byId[row.parent_id]) {
        byId[row.parent_id].children.push(byId[row.id]);
      } else {
        tree.push(byId[row.id]);
      }
    });

    res.json(tree);
  } catch (err) {
    console.error('Categories error:', err.message);
    res.status(500).json({ error: 'Failed to load categories' });
  }
});

module.exports = router;
