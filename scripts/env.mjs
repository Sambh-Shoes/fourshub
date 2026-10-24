// Loads .env so scripts work the same way as the app.
import fs from "node:fs";
import pg from "pg";

if (fs.existsSync(".env")) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

export function connect() {
  process.env.DATABASE_URL ??= process.env.POSTGRES_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_PRISMA_URL;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}
