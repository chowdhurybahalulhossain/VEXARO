// Creates an admin account (or turns an existing account into an admin).
// Run from the backend folder:  npm run create-admin
const readline = require('readline');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { normalizePhone } = require('../utils/phone');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

async function main() {
  console.log('--- Create a VEXARO admin ---');

  const name = (await ask('Name: ')).trim();
  const phone = normalizePhone(await ask('Mobile number (like 01712345678): '));
  const email = (await ask('Email (press Enter to skip): ')).trim().toLowerCase();
  const password = await ask('Password (at least 8 characters): ');
  rl.close();

  if (name.length < 2) throw new Error('Name is too short');
  if (!phone) throw new Error('That is not a valid Bangladeshi mobile number');
  if (password.length < 8 || password.length > 72) throw new Error('Password must be 8 to 72 characters');

  const passwordHash = await bcrypt.hash(password, 10);

  // If this phone already has an account, it becomes an admin with the new password.
  const result = await pool.query(
    `INSERT INTO users (name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, 'admin')
     ON CONFLICT (phone) DO UPDATE
       SET role = 'admin', name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id, name, phone, role`,
    [name, phone, email || null, passwordHash]
  );

  console.log('Done! Admin account ready:', result.rows[0]);
}

main()
  .catch((err) => {
    console.error('Could not create admin:', err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
