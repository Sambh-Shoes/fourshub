import bcrypt from "bcryptjs";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { SCHEMA_SQL } from "@/generated/files";

// Vercel's Neon integration may name the connection string differently depending on how it was linked
// (with a custom prefix it becomes e.g. STORAGE_DATABASE_URL), so look for any of those names.
function findDatabaseUrl() {
  const env = process.env;
  const preferred = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_PRISMA_URL"];
  for (const k of preferred) if (env[k]?.startsWith("postgres")) return env[k];
  for (const suffix of preferred) {
    const key = Object.keys(env).find((k) => k.endsWith(`_${suffix}`) && env[k]?.startsWith("postgres"));
    if (key) return env[key];
  }
  return undefined;
}
export const DATABASE_URL = findDatabaseUrl();

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
    await client.query(SCHEMA_SQL);
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

/** A short, safe explanation of a database error for the login screen (never shows the password). */
export function describeDbError(err: unknown) {
  if (!DATABASE_URL) return "No database is connected to this site yet.";
  const e = err as { code?: string; message?: string };
  const msg = (e?.message ?? String(err)).replace(/postgres(ql)?:\/\/\S+/g, "[database address]").slice(0, 200);
  return e?.code ? `${e.code}: ${msg}` : msg;
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
