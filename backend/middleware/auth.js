const jwt = require('jsonwebtoken');
const pool = require('../db');
const { HttpError, sendError } = require('../utils/httpError');

// Expects the header:  Authorization: Bearer <token>
// The user is loaded from the database on every request, so a deleted
// account or a changed role takes effect immediately.
async function requireAuth(req, res, next) {
  try {
    const [scheme, token] = (req.get('authorization') || '').split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new HttpError(401, 'Please log in first');
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw new HttpError(401, 'Your session has expired. Please log in again.');
    }

    const result = await pool.query(
      'SELECT id, name, phone, email, role FROM users WHERE id = $1',
      [payload.id]
    );
    if (result.rows.length === 0) {
      throw new HttpError(401, 'Account not found. Please log in again.');
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    sendError(res, err, 'Auth error:');
  }
}

// Use after requireAuth.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return sendError(res, new HttpError(403, 'Admin access only'), 'Admin check:');
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
