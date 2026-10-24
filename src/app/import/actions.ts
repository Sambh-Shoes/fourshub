"use server";

import fs from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { readTgz } from "@/lib/tar";
// Plain JavaScript module shared with the command-line import.
import { textSource } from "../../../scripts/lib/odoo.mjs";
import { runImport } from "../../../scripts/lib/importer.mjs";

export type ImportState = { error?: string; summary?: string } | null;

export async function importOdoo(_prev: ImportState, form: FormData): Promise<ImportState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file first." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };

  const client = await pool.connect();
  try {
    const files = readTgz(Buffer.from(await file.arrayBuffer()));
    const mapping = fs.readFileSync(path.join(process.cwd(), "mapping/attributes.csv"), "utf8");
    const s = await runImport(client, textSource(files), mapping, { replace: true });
    const pairs = Object.entries(s.pairs as Record<string, number>).map(([k, n]) => `${k} ${n}`).join(", ");
    return { summary: `Loaded ${s.products} products and ${s.variants} sizes. Pairs: ${pairs}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The import failed." };
  } finally {
    client.release();
  }
}
