import fs from "node:fs";
import { connect } from "./env.mjs";

// On Vercel the database may not be connected yet (e.g. preview builds): build anyway.
if (!(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED)) {
  console.warn("DATABASE_URL is not set: skipping database setup.");
  process.exit(0);
}

const db = connect();
await db.connect();
await db.query(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await db.end();
console.log("Database schema is up to date.");
