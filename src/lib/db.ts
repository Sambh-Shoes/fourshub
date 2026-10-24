import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

// Vercel's Neon integration may name the connection string differently depending on how it was linked.
export const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL;

const globalForPool = globalThis as unknown as { pool?: Pool; ready?: Promise<void> };

export const pool = globalForPool.pool ?? new Pool({ connectionString: DATABASE_URL, max: 5 });
globalForPool.pool = pool;

const LOCATIONS = [
  ["GRA", "Gracia", "shop", 1],
  ["JAU", "Jaume I", "shop", 2],
  ["PLA", "Placidia", "shop", 3],
  ["T4", "Shop 4 (opening Nov 2026)", "shop", 4],
  ["ALM", "Warehouse", "warehouse", 5],
] as const;

/**
 * Makes sure the tables, the shops and the first admin exist. Runs once per server start,
 * so a fresh database works without any manual step. Safe to run again and again.
 */
async function setup() {
  if (!DATABASE_URL) throw new Error("No database connected: DATABASE_URL is not set.");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(424242)");
    await client.query(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
    for (const [code, name, kind, sort] of LOCATIONS) {
      await client.query(
        "INSERT INTO locations (code, name, kind, sort) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING",
        [code, name, kind, sort]);
    }
    const users = await client.query("SELECT 1 FROM users LIMIT 1");
    if (users.rowCount === 0 && process.env.ADMIN_PASSWORD) {
      const username = (process.env.ADMIN_USERNAME || "admin").trim().toLowerCase();
      await client.query("INSERT INTO users (name, username, password_hash, role) VALUES ($1, $1, $2, 'admin')",
        [username, await bcrypt.hash(process.env.ADMIN_PASSWORD, 10)]);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    client.release();
  }
}

function ready() {
  globalForPool.ready ??= setup().catch((err) => {
    globalForPool.ready = undefined; // try again on the next request
    throw err;
  });
  return globalForPool.ready;
}

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  await ready();
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
  await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** For code that needs its own connection (the Odoo import). */
export async function connectReady() {
  await ready();
  return pool.connect();
}
