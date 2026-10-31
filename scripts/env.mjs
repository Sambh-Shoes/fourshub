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
  const names = ["DATABASE_URL", "POSTGRES_URL", "DATABASE_URL_UNPOOLED", "POSTGRES_PRISMA_URL"];
  const env = process.env;
  const key = names.find((k) => env[k]?.startsWith("postgres"))
    ?? names.map((n) => Object.keys(env).find((k) => k.endsWith(`_${n}`) && env[k]?.startsWith("postgres"))).find(Boolean);
  if (key) env.DATABASE_URL = env[key];
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  return new pg.Client({ connectionString: process.env.DATABASE_URL });
}
