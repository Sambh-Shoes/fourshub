import fs from "node:fs";
import { connect } from "./env.mjs";

const db = connect();
await db.connect();
await db.query(fs.readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
await db.end();
console.log("Database schema is up to date.");
