require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const categoriesRouter = require('./routes/categories');
const productsRouter = require('./routes/products');
const cartRouter = require('./routes/cart');
const ordersRouter = require('./routes/orders');
const deliveryRouter = require('./routes/delivery');
const couponsRouter = require('./routes/coupons');

const app = express();

app.use(cors());
app.use(express.json());

// Check that the server is running
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'VEXARO' });
});

// Check that the database connection works
app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'"
    );
    res.json({ connected: true, tables: result.rows[0].tables });
  } catch (err) {
    console.error('DB error:', err.message);
    res.status(500).json({ connected: false, error: err.message });
  }
});

app.use('/api/categories', categoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/cart', cartRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/delivery-zones', deliveryRouter);
app.use('/api/coupons', couponsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VEXARO server running on http://localhost:${PORT}`);
});
