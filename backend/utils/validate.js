const { HttpError } = require('./httpError');

// Money amount: a number from 0 up, rounded to 2 decimals.
function readMoney(value, field) {
  const n = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(n) || n < 0 || n > 10000000) {
    throw new HttpError(400, `${field} must be a valid amount`);
  }
  return Math.round(n * 100) / 100;
}

function readId(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new HttpError(400, `${field} must be a valid id`);
  }
  return n;
}

// An id, or null when the field is cleared.
function readIdOrNull(value, field) {
  if (value === null || value === undefined || value === '') return null;
  return readId(value, field);
}

function readInt(value, field, min, max) {
  const n = Number(value);
  if (value === '' || value === null || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function readBool(value, field) {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${field} must be true or false`);
  }
  return value;
}

// Trimmed text. Returns null when empty (only allowed when min is 0).
function readText(value, field, { min = 0, max = 1000 } = {}) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (text.length < min || text.length > max) {
    throw new HttpError(
      400,
      min > 0 ? `${field} must be ${min} to ${max} characters` : `${field} must be at most ${max} characters`
    );
  }
  return text === '' ? null : text;
}

module.exports = { readMoney, readId, readIdOrNull, readInt, readBool, readText };
