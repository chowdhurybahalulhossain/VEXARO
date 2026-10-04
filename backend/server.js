require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`VEXARO server running on http://localhost:${PORT}`);
});
