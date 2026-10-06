const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');
const { normalizePhone } = require('../utils/phone');
const { readText } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function publicUser(row) {
  return { id: row.id, name: row.name, phone: row.phone, email: row.email, role: row.role };
}

function readPassword(value) {
  const password = String(value || '');
  // bcrypt only uses the first 72 characters, so longer passwords are refused.
  if (password.length < 8 || password.length > 72) {
    throw new HttpError(400, 'Password must be 8 to 72 characters');
  }
  return password;
}

// POST /api/auth/register   body: { name, phone, email?, password }
// Always creates a "customer". Admins are created with the createAdmin script.
router.post('/register', async (req, res) => {
  try {
    const name = readText(req.body.name, 'name', { min: 2, max: 120 });
    const phone = normalizePhone(req.body.phone);
    const emailText = readText(req.body.email, 'email', { max: 160 });
    const password = readPassword(req.body.password);

    if (!phone) {
      throw new HttpError(400, 'Please enter a valid mobile number, like 01712345678');
    }
    if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) {
      throw new HttpError(400, 'Please enter a valid email address');
    }
    const email = emailText ? emailText.toLowerCase() : null;

    const existing = await pool.query(
      'SELECT 1 FROM users WHERE phone = $1 OR ($2::text IS NOT NULL AND lower(email) = $2)',
      [phone, email]
    );
    if (existing.rows.length > 0) {
      throw new HttpError(409, 'An account with this phone number or email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (name, phone, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, phone, email, role`,
      [name, phone, email, passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err) {
    sendError(res, err, 'Register error:');
  }
});

// POST /api/auth/login   body: { login: "01712345678" or "me@mail.com", password }
router.post('/login', async (req, res) => {
  try {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');

    if (!login || !password) {
      throw new HttpError(400, 'Please enter your phone or email and password');
    }

    let result;
    if (login.includes('@')) {
      result = await pool.query('SELECT * FROM users WHERE lower(email) = lower($1)', [login]);
    } else {
      const phone = normalizePhone(login);
      result = phone
        ? await pool.query('SELECT * FROM users WHERE phone = $1', [phone])
        : { rows: [] };
    }

    const user = result.rows[0];
    const passwordOk = user ? await bcrypt.compare(password, user.password_hash) : false;

    // Same message for "no such user" and "wrong password" on purpose.
    if (!passwordOk) {
      throw new HttpError(401, 'Wrong phone/email or password');
    }

    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err) {
    sendError(res, err, 'Login error:');
  }
});

// GET /api/auth/me   (needs the Authorization: Bearer <token> header)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
