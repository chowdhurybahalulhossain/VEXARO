const express = require('express');
const pool = require('../db');

const router = express.Router();

const MAX_QTY_PER_ITEM = 10;

// Same price rule as the products API: discount price while the sale is running.
const FINAL_PRICE = `(CASE
    WHEN p.discount_price IS NOT NULL
         AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
    THEN p.discount_price
    ELSE p.price
  END)`;

// Guests are identified by a random id the frontend creates once and sends on
// every cart request in the "x-session-id" header.
function requireSession(req, res, next) {
  const id = req.get('x-session-id');
  if (!id || id.length < 10 || id.length > 100) {
    return res
      .status(400)
      .json({ error: 'x-session-id header is required (10 to 100 characters)' });
  }
  req.sessionId = id;
  next();
}

function parseQuantity(value, fallback) {
  const qty = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
    return null;
  }
  return qty;
}

// Builds the full cart response for one session.
async function getCart(sessionId) {
  const result = await pool.query(
    `SELECT
       ci.id,
       ci.variant_id,
       ci.quantity,
       v.size,
       v.color,
       v.sku,
       v.stock,
       p.id AS product_id,
       p.name,
       p.slug,
       COALESCE(v.price_override, ${FINAL_PRICE})::float AS unit_price,
       (SELECT image_url FROM product_images
         WHERE product_id = p.id ORDER BY sort_order LIMIT 1) AS image
     FROM cart_items ci
     JOIN product_variants v ON v.id = ci.variant_id
     JOIN products p ON p.id = v.product_id
     WHERE ci.session_id = $1 AND p.is_active = TRUE
     ORDER BY ci.created_at, ci.id`,
    [sessionId]
  );

  let subtotal = 0;
  let itemCount = 0;

  const items = result.rows.map((row) => {
    const lineTotal = Math.round(row.unit_price * row.quantity * 100) / 100;
    subtotal += lineTotal;
    itemCount += row.quantity;
    return {
      ...row,
      line_total: lineTotal,
      in_stock: row.stock >= row.quantity,
    };
  });

  return {
    items,
    item_count: itemCount,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}

router.use(requireSession);

// GET /api/cart
router.get('/', async (req, res) => {
  try {
    res.json(await getCart(req.sessionId));
  } catch (err) {
    console.error('Get cart error:', err.message);
    res.status(500).json({ error: 'Failed to load cart' });
  }
});

// POST /api/cart   body: { "variant_id": 3, "quantity": 2 }
router.post('/', async (req, res) => {
  try {
    const variantId = Number(req.body.variant_id);
    const quantity = parseQuantity(req.body.quantity, 1);

    if (!Number.isInteger(variantId) || variantId < 1) {
      return res.status(400).json({ error: 'A valid variant_id is required' });
    }
    if (quantity === null) {
      return res
        .status(400)
        .json({ error: `quantity must be a whole number from 1 to ${MAX_QTY_PER_ITEM}` });
    }

    const variantResult = await pool.query(
      `SELECT v.id, v.stock
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       WHERE v.id = $1 AND p.is_active = TRUE`,
      [variantId]
    );
    if (variantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product variant not found' });
    }
    const stock = variantResult.rows[0].stock;

    const existingResult = await pool.query(
      'SELECT id, quantity FROM cart_items WHERE session_id = $1 AND variant_id = $2',
      [req.sessionId, variantId]
    );
    const existing = existingResult.rows[0];
    const newQuantity = (existing ? existing.quantity : 0) + quantity;

    if (newQuantity > stock) {
      return res.status(400).json({ error: 'Not enough stock', available: stock });
    }
    if (newQuantity > MAX_QTY_PER_ITEM) {
      return res
        .status(400)
        .json({ error: `You can add at most ${MAX_QTY_PER_ITEM} of one item` });
    }

    if (existing) {
      await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [
        newQuantity,
        existing.id,
      ]);
    } else {
      await pool.query(
        'INSERT INTO cart_items (session_id, variant_id, quantity) VALUES ($1, $2, $3)',
        [req.sessionId, variantId, quantity]
      );
    }

    res.status(201).json(await getCart(req.sessionId));
  } catch (err) {
    console.error('Add to cart error:', err.message);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

// PATCH /api/cart/:id   body: { "quantity": 3 }
router.patch('/:id', async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    const quantity = parseQuantity(req.body.quantity, undefined);

    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ error: 'Invalid cart item id' });
    }
    if (quantity === null) {
      return res
        .status(400)
        .json({ error: `quantity must be a whole number from 1 to ${MAX_QTY_PER_ITEM}` });
    }

    const itemResult = await pool.query(
      `SELECT ci.id, v.stock
       FROM cart_items ci
       JOIN product_variants v ON v.id = ci.variant_id
       WHERE ci.id = $1 AND ci.session_id = $2`,
      [itemId, req.sessionId]
    );
    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Cart item not found' });
    }
    if (quantity > itemResult.rows[0].stock) {
      return res
        .status(400)
        .json({ error: 'Not enough stock', available: itemResult.rows[0].stock });
    }

    await pool.query('UPDATE cart_items SET quantity = $1 WHERE id = $2', [quantity, itemId]);

    res.json(await getCart(req.sessionId));
  } catch (err) {
    console.error('Update cart error:', err.message);
    res.status(500).json({ error: 'Failed to update cart' });
  }
});

// DELETE /api/cart/:id  ->  remove one item
router.delete('/:id', async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (!Number.isInteger(itemId) || itemId < 1) {
      return res.status(400).json({ error: 'Invalid cart item id' });
    }

    await pool.query('DELETE FROM cart_items WHERE id = $1 AND session_id = $2', [
      itemId,
      req.sessionId,
    ]);

    res.json(await getCart(req.sessionId));
  } catch (err) {
    console.error('Remove cart item error:', err.message);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// DELETE /api/cart  ->  empty the whole cart
router.delete('/', async (req, res) => {
  try {
    await pool.query('DELETE FROM cart_items WHERE session_id = $1', [req.sessionId]);
    res.json(await getCart(req.sessionId));
  } catch (err) {
    console.error('Clear cart error:', err.message);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;