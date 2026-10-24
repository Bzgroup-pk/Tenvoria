import bcrypt from 'bcryptjs';
import { sql } from './db.js';
import { config } from './config.js';
const email = config.FOUNDER_EMAIL.toLowerCase();
const passwordHash = await bcrypt.hash(config.FOUNDER_PASSWORD, 12);
const rows = await sql`SELECT id, scope FROM app_users WHERE lower(email) = ${email} LIMIT 1`;
if (rows.length && rows[0].scope !== 'founder') throw new Error('That email already belongs to a non-founder account. Choose a separate founder email.');
if (rows.length) {
  await sql`UPDATE app_users SET password_hash=${passwordHash}, updated_at=now() WHERE id=${rows[0].id} AND scope='founder'`;
} else {
  await sql`INSERT INTO app_users (email, password_hash, scope) VALUES (${email}, ${passwordHash}, 'founder')`;
}
console.log(`Founder account seeded for ${email}. Store the password safely and remove it from deployment secrets if no longer needed.`);
