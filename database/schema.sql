-- =====================================================
-- VEXARO : Clothing E-commerce Database Schema
-- PostgreSQL
-- Run:  psql -U postgres -d vexaro_db -f schema.sql
-- =====================================================

-- ---------- USERS & ADDRESSES ----------
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(120) NOT NULL,
    email           VARCHAR(160) UNIQUE,
    phone           VARCHAR(20)  UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(20) NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'admin')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name       VARCHAR(120) NOT NULL,
    phone           VARCHAR(20)  NOT NULL,
    district        VARCHAR(80)  NOT NULL,
    area            VARCHAR(120),
    address_line    TEXT NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------- CATALOG ----------
CREATE TABLE categories (
    id              SERIAL PRIMARY KEY,
    parent_id       INT REFERENCES categories(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(120) UNIQUE NOT NULL,
    image_url       TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE brands (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    slug            VARCHAR(120) UNIQUE NOT NULL,
    logo_url        TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE products (
    id              SERIAL PRIMARY KEY,
    category_id     INT REFERENCES categories(id) ON DELETE SET NULL,
    brand_id        INT REFERENCES brands(id) ON DELETE SET NULL,
    name            VARCHAR(200) NOT NULL,
    slug            VARCHAR(220) UNIQUE NOT NULL,
    description     TEXT,
    size_chart_url  TEXT,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    discount_price  NUMERIC(10,2) CHECK (discount_price >= 0),
    sale_ends_at    TIMESTAMPTZ,                -- used for Flash Sale
    badge           VARCHAR(30)
                    CHECK (badge IN ('best_selling', 'new_arrival', 'offered')),
    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
    id              SERIAL PRIMARY KEY,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url       TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

-- Size + color variants. Stock lives here, not on products.
CREATE TABLE product_variants (
    id              SERIAL PRIMARY KEY,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    size            VARCHAR(20),
    color           VARCHAR(40),
    sku             VARCHAR(60) UNIQUE,
    price_override  NUMERIC(10,2) CHECK (price_override >= 0),
    stock           INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    UNIQUE (product_id, size, color)
);

-- ---------- CART & WISHLIST ----------
-- Guests use session_id, logged-in users use user_id.
CREATE TABLE cart_items (
    id              SERIAL PRIMARY KEY,
    user_id         INT REFERENCES users(id) ON DELETE CASCADE,
    session_id      VARCHAR(100),
    variant_id      INT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    quantity        INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE wishlists (
    id              SERIAL PRIMARY KEY,
    user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (user_id, product_id)
);

-- ---------- DELIVERY & COUPONS ----------
CREATE TABLE delivery_zones (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(80) NOT NULL,
    charge          NUMERIC(10,2) NOT NULL CHECK (charge >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE coupons (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(40) UNIQUE NOT NULL,
    discount_type   VARCHAR(10) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value  NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    min_order       NUMERIC(10,2) NOT NULL DEFAULT 0,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ---------- ORDERS ----------
-- user_id is NULL for guest checkout. Customer info is stored on the order itself.
-- Order tracking (no login): order_number + phone.
CREATE TABLE orders (
    id                SERIAL PRIMARY KEY,
    order_number      VARCHAR(30) UNIQUE NOT NULL,
    user_id           INT REFERENCES users(id) ON DELETE SET NULL,
    customer_name     VARCHAR(120) NOT NULL,
    phone             VARCHAR(20)  NOT NULL,
    email             VARCHAR(160),
    district          VARCHAR(80)  NOT NULL,
    shipping_address  TEXT NOT NULL,
    note              TEXT,
    subtotal          NUMERIC(10,2) NOT NULL,
    delivery_charge   NUMERIC(10,2) NOT NULL DEFAULT 0,
    discount          NUMERIC(10,2) NOT NULL DEFAULT 0,
    total             NUMERIC(10,2) NOT NULL,
    coupon_code       VARCHAR(40),
    payment_method    VARCHAR(20) NOT NULL
                      CHECK (payment_method IN ('cod', 'bkash', 'nagad', 'card')),
    payment_status    VARCHAR(20) NOT NULL DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    order_status      VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (order_status IN ('pending', 'confirmed', 'shipped',
                                              'delivered', 'cancelled', 'returned')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Product name, size, color and price are copied here so old orders stay correct
-- even if the product is edited or deleted later.
CREATE TABLE order_items (
    id              SERIAL PRIMARY KEY,
    order_id        INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id      INT REFERENCES product_variants(id) ON DELETE SET NULL,
    product_name    VARCHAR(200) NOT NULL,
    size            VARCHAR(20),
    color           VARCHAR(40),
    price           NUMERIC(10,2) NOT NULL,
    quantity        INT NOT NULL CHECK (quantity > 0)
);

-- ---------- REVIEWS & CONTENT ----------
CREATE TABLE reviews (
    id              SERIAL PRIMARY KEY,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id         INT REFERENCES users(id) ON DELETE SET NULL,
    reviewer_name   VARCHAR(120),
    rating          INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment         TEXT,
    is_approved     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE banners (
    id              SERIAL PRIMARY KEY,
    image_url       TEXT NOT NULL,
    link_url        TEXT,
    position        VARCHAR(20) NOT NULL DEFAULT 'hero'
                    CHECK (position IN ('hero', 'promo', 'brand')),
    sort_order      INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE testimonials (
    id              SERIAL PRIMARY KEY,
    author_name     VARCHAR(120) NOT NULL,
    occupation      VARCHAR(80),
    photo_url       TEXT,
    message         TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- Static pages: About us, Privacy Policy, Refund Policy, Exchange, Shipping, etc.
CREATE TABLE pages (
    id              SERIAL PRIMARY KEY,
    slug            VARCHAR(120) UNIQUE NOT NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE faqs (
    id              SERIAL PRIMARY KEY,
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

-- ---------- INDEXES ----------
CREATE INDEX idx_products_category   ON products(category_id);
CREATE INDEX idx_products_brand      ON products(brand_id);
CREATE INDEX idx_variants_product    ON product_variants(product_id);
CREATE INDEX idx_cart_user           ON cart_items(user_id);
CREATE INDEX idx_cart_session        ON cart_items(session_id);
CREATE INDEX idx_orders_user         ON orders(user_id);
CREATE INDEX idx_orders_phone        ON orders(phone);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_reviews_product     ON reviews(product_id);

-- ---------- SAMPLE STARTER DATA (change the amounts to your own) ----------
INSERT INTO delivery_zones (name, charge) VALUES
    ('Inside Dhaka', 60),
    ('Outside Dhaka', 120);
