// Creates the shops, the warehouse and the first admin account.
import bcrypt from "bcryptjs";
import { connect } from "./env.mjs";

const LOCATIONS = [
  ["GRA", "Gracia", "shop", 1],
  ["JAU", "Jaume I", "shop", 2],
  ["PLA", "Placidia", "shop", 3],
  ["T4", "Shop 4 (opening Nov 2026)", "shop", 4],
  ["ALM", "Warehouse", "warehouse", 5],
];

const db = connect();
await db.connect();
for (const [code, name, kind, sort] of LOCATIONS) {
  await db.query(
    `INSERT INTO locations (code, name, kind, sort) VALUES ($1, $2, $3, $4)
     ON CONFLICT (code) DO NOTHING`,
    [code, name, kind, sort],
  );
}

const username = process.env.ADMIN_USERNAME || "admin";
const password = process.env.ADMIN_PASSWORD;
const existing = await db.query("SELECT 1 FROM users WHERE username = $1", [username]);
if (existing.rowCount === 0) {
  if (!password) {
    console.warn("No admin account yet: set ADMIN_PASSWORD (and ADMIN_USERNAME) and run this again.");
    await db.end();
    process.exit(0);
  }
  await db.query(
    `INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    [username, username, await bcrypt.hash(password, 10)],
  );
  console.log(`Created admin account "${username}".`);
}
await db.end();
console.log("Shops and warehouse are in place.");
