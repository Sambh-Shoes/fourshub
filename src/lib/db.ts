import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForPool = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForPool.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForPool.pool = pool;

export async function query<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const res = await pool.query<T>(sql, params);
  return res.rows;
}

export async function one<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>) {
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
