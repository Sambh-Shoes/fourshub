"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hashPassword, requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export type StaffState = { error?: string; summary?: string } | null;

/** Adds the ticked names from Odoo's sales history as employees. They cannot sign in until you give each a password. */
export async function addStaffFromSales(_prev: StaffState, form: FormData): Promise<StaffState> {
  await requireUser("users.manage");
  const names = form.getAll("name").map(String).filter(Boolean);
  if (names.length === 0) return { error: "Tick at least one person." };
  let added = 0;
  for (const name of names) {
    const known = await query("SELECT 1 FROM users WHERE lower(name) = lower($1) OR lower(sales_name) = lower($1)", [name]);
    if (known.length) continue;
    const shop = await query<{ location_id: number }>(
      `SELECT location_id FROM sales WHERE cashier = $1 AND location_id IS NOT NULL AND sold_at > now() - interval '180 days'
        GROUP BY location_id ORDER BY count(*) DESC LIMIT 1`, [name]);
    const base = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") || "user";
    let username = base;
    for (let n = 2; (await query("SELECT 1 FROM users WHERE username = $1", [username])).length; n++) username = `${base}${n}`;
    await query(
      `INSERT INTO users (name, username, password_hash, role, location_id, active, sales_name) VALUES ($1, $2, $3, 'shop', $4, false, $1)`,
      [name, username, await hashPassword(randomBytes(24).toString("hex")), shop[0]?.location_id ?? null]);
    added++;
  }
  revalidatePath("/users");
  return { summary: `Added ${added} ${added === 1 ? "person" : "people"}. Open each one to set a password and tick “can sign in”.` };
}
