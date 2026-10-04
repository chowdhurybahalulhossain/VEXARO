-- =====================================================
-- VEXARO : SAMPLE DATA (for testing only)
-- Run this ONCE after schema.sql. Running it twice will fail
-- because category and product slugs must be unique.
-- Names, prices and images below are placeholders - replace later.
-- =====================================================

-- ---------- CATEGORIES ----------
INSERT INTO categories (name, slug, sort_order) VALUES
    ('Men',   'men',   1),
    ('Women', 'women', 2),
    ('Kids',  'kids',  3);

INSERT INTO categories (parent_id, name, slug, sort_order) VALUES
    ((SELECT id FROM categories WHERE slug = 'men'),   'T-Shirts',    'men-t-shirts',    1),
    ((SELECT id FROM categories WHERE slug = 'men'),   'Shirts',      'men-shirts',      2),
    ((SELECT id FROM categories WHERE slug = 'men'),   'Panjabi',     'men-panjabi',     3),
    ((SELECT id FROM categories WHERE slug = 'women'), 'Kurti',       'women-kurti',     1),
    ((SELECT id FROM categories WHERE slug = 'women'), 'Three Piece', 'women-three-piece', 2);

-- ---------- BRAND ----------
INSERT INTO brands (name, slug) VALUES ('VEXARO', 'vexaro');

-- ---------- PRODUCTS ----------
INSERT INTO products
    (category_id, brand_id, name, slug, description, price, discount_price, badge, is_featured)
VALUES
    ((SELECT id FROM categories WHERE slug = 'men-t-shirts'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Classic Cotton T-Shirt', 'classic-cotton-t-shirt',
     'Soft 100% cotton t-shirt for everyday wear.',
     650, 550, 'best_selling', TRUE),

    ((SELECT id FROM categories WHERE slug = 'men-t-shirts'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Oversized Graphic Tee', 'oversized-graphic-tee',
     'Relaxed oversized fit with a bold printed graphic.',
     850, NULL, 'new_arrival', TRUE),

    ((SELECT id FROM categories WHERE slug = 'men-shirts'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Formal Oxford Shirt', 'formal-oxford-shirt',
     'Breathable oxford cotton shirt for office and events.',
     1450, 1250, NULL, FALSE),

    ((SELECT id FROM categories WHERE slug = 'men-panjabi'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Embroidered Cotton Panjabi', 'embroidered-cotton-panjabi',
     'Light cotton panjabi with neat embroidery on the collar.',
     2200, 1950, 'best_selling', TRUE),

    ((SELECT id FROM categories WHERE slug = 'women-kurti'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Printed Cotton Kurti', 'printed-cotton-kurti',
     'Comfortable printed kurti, perfect for daily use.',
     1200, 990, 'offered', FALSE),

    ((SELECT id FROM categories WHERE slug = 'women-three-piece'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Cotton Three Piece Set', 'cotton-three-piece-set',
     'Three piece set with kameez, salwar and orna.',
     2800, NULL, 'new_arrival', TRUE),

    ((SELECT id FROM categories WHERE slug = 'kids'),
     (SELECT id FROM brands WHERE slug = 'vexaro'),
     'Kids Cotton Polo', 'kids-cotton-polo',
     'Soft and durable polo shirt for kids.',
     550, NULL, NULL, FALSE);

-- ---------- IMAGES (placeholder pictures, two per product) ----------
INSERT INTO product_images (product_id, image_url, sort_order)
SELECT id, 'https://placehold.co/600x800?text=' || replace(name, ' ', '+'), 0
FROM products;

INSERT INTO product_images (product_id, image_url, sort_order)
SELECT id, 'https://placehold.co/600x800?text=' || replace(name, ' ', '+') || '+Back', 1
FROM products;

-- ---------- VARIANTS (sizes x colors, 10 in stock each) ----------
-- One variant (XL / Black) is set to 0 so you can test an out-of-stock case.
INSERT INTO product_variants (product_id, size, color, sku, stock)
SELECT
    p.id,
    s.size,
    c.color,
    'VX-' || p.id || '-' || s.size || '-' || upper(left(c.color, 3)),
    CASE WHEN s.size = 'XL' AND c.color = 'Black' THEN 0 ELSE 10 END
FROM products p
CROSS JOIN (VALUES ('M'), ('L'), ('XL')) AS s(size)
CROSS JOIN (VALUES ('Black'), ('White')) AS c(color);
