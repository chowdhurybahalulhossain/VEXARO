const express = require('express');
const pool = require('../db');

const router = express.Router();

// The price a customer actually pays: discount price while the sale is running.
const FINAL_PRICE = `(CASE
    WHEN p.discount_price IS NOT NULL
         AND (p.sale_ends_at IS NULL OR p.sale_ends_at > now())
    THEN p.discount_price
    ELSE p.price
  END)`;

const SORTS = {
  newest: 'p.created_at DESC',
  price_asc: `${FINAL_PRICE} ASC`,
  price_desc: `${FINAL_PRICE} DESC`,
};

// GET /api/products
// Query options: category, search, badge, featured, min_price, max_price,
//                sort (newest | price_asc | price_desc), page, limit
router.get('/', async (req, res) => {
  try {
    const { category, search, badge, featured, min_price, max_price, sort } = req.query;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);
    const offset = (page - 1) * limit;

    const where = ['p.is_active = TRUE'];
    const params = [];

    if (category) {
      params.push(category);
      const n = params.length;
      // A parent category (e.g. "men") also includes products of its sub-categories.
      where.push(
        `(c.slug = $${n} OR c.parent_id = (SELECT id FROM categories WHERE slug = $${n}))`
      );
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`p.name ILIKE $${params.length}`);
    }

    if (badge) {
      params.push(badge);
      where.push(`p.badge = $${params.length}`);
    }

    if (featured === 'true') {
      where.push('p.is_featured = TRUE');
    }

    const min = Number(min_price);
    if (min_price && !Number.isNaN(min)) {
      params.push(min);
      where.push(`${FINAL_PRICE} >= $${params.length}`);
    }

    const max = Number(max_price);
    if (max_price && !Number.isNaN(max)) {
      params.push(max);
      where.push(`${FINAL_PRICE} <= $${params.length}`);
    }

    const baseFrom = `
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN brands b ON b.id = p.brand_id
      WHERE ${where.join(' AND ')}`;

    const orderBy = SORTS[sort] || SORTS.newest;

    const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${baseFrom}`, params);
    const total = countResult.rows[0].total;

    const listResult = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.slug,
         p.price::float AS price,
         p.discount_price::float AS discount_price,
         ${FINAL_PRICE}::float AS final_price,
         p.badge,
         p.sale_ends_at,
         c.name AS category_name,
         c.slug AS category_slug,
         b.name AS brand_name,
         (SELECT image_url FROM product_images
           WHERE product_id = p.id ORDER BY sort_order LIMIT 1) AS image,
         COALESCE((SELECT SUM(stock) FROM product_variants
           WHERE product_id = p.id), 0)::int AS total_stock
       ${baseFrom}
       ORDER BY ${orderBy}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
      products: listResult.rows,
    });
  } catch (err) {
    console.error('Products list error:', err.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// GET /api/products/:slug  ->  one product with all images and size/color variants
router.get('/:slug', async (req, res) => {
  try {
    const productResult = await pool.query(
      `SELECT
         p.id,
         p.name,
         p.slug,
         p.description,
         p.size_chart_url,
         p.price::float AS price,
         p.discount_price::float AS discount_price,
         ${FINAL_PRICE}::float AS final_price,
         p.badge,
         p.sale_ends_at,
         c.name AS category_name,
         c.slug AS category_slug,
         b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.slug = $1 AND p.is_active = TRUE`,
      [req.params.slug]
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = productResult.rows[0];

    const imagesResult = await pool.query(
      `SELECT id, image_url, sort_order
       FROM product_images
       WHERE product_id = $1
       ORDER BY sort_order`,
      [product.id]
    );

    const variantsResult = await pool.query(
      `SELECT
         id,
         size,
         color,
         sku,
         COALESCE(price_override, $2)::float AS price,
         stock
       FROM product_variants
       WHERE product_id = $1
       ORDER BY color,
         CASE size
           WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
           WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
           ELSE 7
         END`,
      [product.id, product.final_price]
    );

    res.json({
      ...product,
      images: imagesResult.rows,
      variants: variantsResult.rows,
    });
  } catch (err) {
    console.error('Product detail error:', err.message);
    res.status(500).json({ error: 'Failed to load product' });
  }
});

module.exports = router;
