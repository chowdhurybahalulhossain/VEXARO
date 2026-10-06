const express = require('express');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');
const { uniqueSlug } = require('../utils/slug');
const {
  readMoney,
  readId,
  readIdOrNull,
  readInt,
  readBool,
  readText,
} = require('../utils/validate');

// Mounted behind requireAuth + requireAdmin in server.js.
const router = express.Router();

const BADGES = ['best_selling', 'new_arrival', 'offered'];

// ---------- helpers ----------

// Reads and validates the product columns that were sent.
// requireAll = true for creating, false for partial updates.
function readProductFields(body, { requireAll }) {
  const has = (key) => body[key] !== undefined;
  const out = {};

  if (requireAll || has('name')) out.name = readText(body.name, 'name', { min: 2, max: 200 });
  if (requireAll || has('price')) out.price = readMoney(body.price, 'price');

  if (has('discount_price')) {
    out.discount_price =
      body.discount_price === null || body.discount_price === ''
        ? null
        : readMoney(body.discount_price, 'discount_price');
  }
  if (has('category_id')) out.category_id = readIdOrNull(body.category_id, 'category_id');
  if (has('brand_id')) out.brand_id = readIdOrNull(body.brand_id, 'brand_id');
  if (has('description')) out.description = readText(body.description, 'description', { max: 5000 });
  if (has('size_chart_url')) {
    out.size_chart_url = readText(body.size_chart_url, 'size_chart_url', { max: 500 });
  }

  if (has('sale_ends_at')) {
    if (body.sale_ends_at === null || body.sale_ends_at === '') {
      out.sale_ends_at = null;
    } else {
      const date = new Date(body.sale_ends_at);
      if (Number.isNaN(date.getTime())) {
        throw new HttpError(400, 'sale_ends_at must be a valid date');
      }
      out.sale_ends_at = date.toISOString();
    }
  }

  if (has('badge')) {
    if (body.badge === null || body.badge === '') {
      out.badge = null;
    } else if (BADGES.includes(body.badge)) {
      out.badge = body.badge;
    } else {
      throw new HttpError(400, `badge must be one of: ${BADGES.join(', ')}`);
    }
  }

  if (has('is_featured')) out.is_featured = readBool(body.is_featured, 'is_featured');
  if (has('is_active')) out.is_active = readBool(body.is_active, 'is_active');

  return out;
}

function checkDiscount(price, discountPrice) {
  if (discountPrice !== null && discountPrice !== undefined && discountPrice >= price) {
    throw new HttpError(400, 'discount_price must be lower than price');
  }
}

function readImages(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw new HttpError(400, 'images must be a list of up to 10 image links');
  }
  return value.map((url) => {
    const text = String(url).trim();
    if (!/^(https?:\/\/|\/)/.test(text) || text.length > 500) {
      throw new HttpError(400, 'Each image must be a link starting with http://, https:// or /');
    }
    return text;
  });
}

function readVariant(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new HttpError(400, 'Each variant must be an object like { size, color, stock }');
  }
  return {
    size: readText(raw.size, 'size', { max: 20 }),
    color: readText(raw.color, 'color', { max: 40 }),
    stock: raw.stock === undefined ? 0 : readInt(raw.stock, 'stock', 0, 100000),
    priceOverride:
      raw.price_override === undefined || raw.price_override === null || raw.price_override === ''
        ? null
        : readMoney(raw.price_override, 'price_override'),
    sku: readText(raw.sku, 'sku', { max: 60 }),
  };
}

// VX-12-M-BLA style code, used when no sku is sent.
function makeSku(productId, size, color) {
  const part = (value) => (value ? value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'NA' : 'NA');
  return `VX-${productId}-${part(size)}-${part(color)}`;
}

async function insertVariant(db, productId, variant) {
  const result = await db.query(
    `INSERT INTO product_variants (product_id, size, color, sku, price_override, stock)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, size, color, sku, price_override::float AS price_override, stock`,
    [
      productId,
      variant.size,
      variant.color,
      variant.sku || makeSku(productId, variant.size, variant.color),
      variant.priceOverride,
      variant.stock,
    ]
  );
  return result.rows[0];
}

// ---------- products ----------

// GET /api/admin/products?search=&page=&limit=   (includes hidden products)
router.get('/products', async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    const params = [];
    let where = 'TRUE';
    if (search) {
      params.push(`%${search}%`);
      where = 'p.name ILIKE $1';
    }

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM products p WHERE ${where}`,
      params
    );
    const total = countResult.rows[0].total;

    const listResult = await pool.query(
      `SELECT p.id, p.name, p.slug,
              p.price::float AS price,
              p.discount_price::float AS discount_price,
              p.badge, p.is_featured, p.is_active, p.created_at,
              c.name AS category_name,
              COALESCE((SELECT SUM(stock) FROM product_variants
                         WHERE product_id = p.id), 0)::int AS total_stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE ${where}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, (page - 1) * limit]
    );

    res.json({ page, limit, total, total_pages: Math.ceil(total / limit), products: listResult.rows });
  } catch (err) {
    sendError(res, err, 'Admin product list error:');
  }
});

// POST /api/admin/products
// Body: name, price, category_id?, brand_id?, description?, discount_price?, sale_ends_at?,
//       badge?, is_featured?, is_active?, size_chart_url?,
//       images: [url, ...], variants: [{ size, color, stock, price_override?, sku? }, ...]
router.post('/products', async (req, res) => {
  const client = await pool.connect();
  try {
    const fields = readProductFields(req.body, { requireAll: true });
    checkDiscount(fields.price, fields.discount_price);
    const images = readImages(req.body.images);

    if (!Array.isArray(req.body.variants) || req.body.variants.length === 0 || req.body.variants.length > 60) {
      throw new HttpError(400, 'Add 1 to 60 variants (size / color / stock)');
    }
    const variants = req.body.variants.map(readVariant);

    await client.query('BEGIN');

    const slug = await uniqueSlug(client, 'products', fields.name);

    const productResult = await client.query(
      `INSERT INTO products
         (category_id, brand_id, name, slug, description, size_chart_url,
          price, discount_price, sale_ends_at, badge, is_featured, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, slug`,
      [
        fields.category_id === undefined ? null : fields.category_id,
        fields.brand_id === undefined ? null : fields.brand_id,
        fields.name,
        slug,
        fields.description === undefined ? null : fields.description,
        fields.size_chart_url === undefined ? null : fields.size_chart_url,
        fields.price,
        fields.discount_price === undefined ? null : fields.discount_price,
        fields.sale_ends_at === undefined ? null : fields.sale_ends_at,
        fields.badge === undefined ? null : fields.badge,
        fields.is_featured === undefined ? false : fields.is_featured,
        fields.is_active === undefined ? true : fields.is_active,
      ]
    );
    const product = productResult.rows[0];

    for (let i = 0; i < images.length; i += 1) {
      await client.query(
        'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
        [product.id, images[i], i]
      );
    }

    const createdVariants = [];
    for (const variant of variants) {
      createdVariants.push(await insertVariant(client, product.id, variant));
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Product created',
      id: product.id,
      slug: product.slug,
      variants: createdVariants,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Create product error:');
  } finally {
    client.release();
  }
});

// PUT /api/admin/products/:id   (send only the fields you want to change)
// If "images" is sent, it replaces all the product's images.
router.put('/products/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = readId(req.params.id, 'product id');
    const fields = readProductFields(req.body, { requireAll: false });
    const images = req.body.images === undefined ? null : readImages(req.body.images);

    const columns = Object.keys(fields);
    if (columns.length === 0 && images === null) {
      throw new HttpError(400, 'Nothing to update');
    }

    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT price::float AS price, discount_price::float AS discount_price FROM products WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (existing.rows.length === 0) {
      throw new HttpError(404, 'Product not found');
    }

    const price = fields.price !== undefined ? fields.price : existing.rows[0].price;
    const discount =
      fields.discount_price !== undefined ? fields.discount_price : existing.rows[0].discount_price;
    checkDiscount(price, discount);

    if (columns.length > 0) {
      // Column names come from readProductFields above, never from the request directly.
      const setSql = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
      await client.query(`UPDATE products SET ${setSql} WHERE id = $${columns.length + 1}`, [
        ...columns.map((column) => fields[column]),
        id,
      ]);
    }

    if (images !== null) {
      await client.query('DELETE FROM product_images WHERE product_id = $1', [id]);
      for (let i = 0; i < images.length; i += 1) {
        await client.query(
          'INSERT INTO product_images (product_id, image_url, sort_order) VALUES ($1, $2, $3)',
          [id, images[i], i]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Product updated', id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    sendError(res, err, 'Update product error:');
  } finally {
    client.release();
  }
});

// DELETE /api/admin/products/:id
// Only hides the product (is_active = false) so old orders keep their history.
router.delete('/products/:id', async (req, res) => {
  try {
    const id = readId(req.params.id, 'product id');
    const result = await pool.query(
      'UPDATE products SET is_active = FALSE WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Product not found');
    }
    res.json({ message: 'Product hidden from the shop', id });
  } catch (err) {
    sendError(res, err, 'Delete product error:');
  }
});

// ---------- variants ----------

// POST /api/admin/products/:id/variants   body: { size, color, stock, price_override?, sku? }
router.post('/products/:id/variants', async (req, res) => {
  try {
    const productId = readId(req.params.id, 'product id');
    const variant = readVariant(req.body);

    const product = await pool.query('SELECT 1 FROM products WHERE id = $1', [productId]);
    if (product.rows.length === 0) {
      throw new HttpError(404, 'Product not found');
    }

    const created = await insertVariant(pool, productId, variant);
    res.status(201).json(created);
  } catch (err) {
    sendError(res, err, 'Add variant error:');
  }
});

// PATCH /api/admin/variants/:id   body: { stock?, price_override? }
router.patch('/variants/:id', async (req, res) => {
  try {
    const id = readId(req.params.id, 'variant id');
    const sets = [];
    const values = [];

    if (req.body.stock !== undefined) {
      values.push(readInt(req.body.stock, 'stock', 0, 100000));
      sets.push(`stock = $${values.length}`);
    }
    if (req.body.price_override !== undefined) {
      const empty = req.body.price_override === null || req.body.price_override === '';
      values.push(empty ? null : readMoney(req.body.price_override, 'price_override'));
      sets.push(`price_override = $${values.length}`);
    }
    if (sets.length === 0) {
      throw new HttpError(400, 'Send stock and/or price_override');
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE product_variants SET ${sets.join(', ')} WHERE id = $${values.length}
       RETURNING id, size, color, sku, price_override::float AS price_override, stock`,
      values
    );
    if (result.rows.length === 0) {
      throw new HttpError(404, 'Variant not found');
    }
    res.json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Update variant error:');
  }
});

// ---------- categories & brands ----------

// POST /api/admin/categories   body: { name, parent_id?, image_url?, sort_order? }
router.post('/categories', async (req, res) => {
  try {
    const name = readText(req.body.name, 'name', { min: 1, max: 100 });
    const parentId = readIdOrNull(req.body.parent_id, 'parent_id');
    const imageUrl = readText(req.body.image_url, 'image_url', { max: 500 });
    const sortOrder = req.body.sort_order === undefined ? 0 : readInt(req.body.sort_order, 'sort_order', 0, 10000);

    const slug = await uniqueSlug(pool, 'categories', name);
    const result = await pool.query(
      `INSERT INTO categories (parent_id, name, slug, image_url, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, parent_id, name, slug, image_url, sort_order`,
      [parentId, name, slug, imageUrl, sortOrder]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Create category error:');
  }
});

// POST /api/admin/brands   body: { name, logo_url? }
router.post('/brands', async (req, res) => {
  try {
    const name = readText(req.body.name, 'name', { min: 1, max: 100 });
    const logoUrl = readText(req.body.logo_url, 'logo_url', { max: 500 });

    const slug = await uniqueSlug(pool, 'brands', name);
    const result = await pool.query(
      'INSERT INTO brands (name, slug, logo_url) VALUES ($1, $2, $3) RETURNING id, name, slug, logo_url',
      [name, slug, logoUrl]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    sendError(res, err, 'Create brand error:');
  }
});

module.exports = router;
