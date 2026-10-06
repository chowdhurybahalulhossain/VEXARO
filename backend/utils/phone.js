// Accepts 01712345678, +8801712345678, 8801712-345678 ... and returns 01712345678.
// Returns null when the number is not a valid Bangladeshi mobile number.
function normalizePhone(value) {
  const digits = String(value || '').replace(/[\s-]/g, '');
  const match = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return match ? match[1] : null;
}

module.exports = { normalizePhone };
