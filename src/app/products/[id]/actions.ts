"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { can } from "@/lib/permissions";

export async function saveProduct(productId: number, form: FormData) {
  const user = await requireUser();
  const editInfo = can(user, "products.edit");
  const editPrice = can(user, "prices.edit");
  if (!editInfo && !editPrice) return;

  if (editInfo) {
    await query(
      `UPDATE products SET name = $2, reference = nullif($3, ''), material = nullif($4, ''),
              category_id = nullif($5, '')::int, active = $6, updated_at = now() WHERE id = $1`,
      [productId, String(form.get("name")).trim(), String(form.get("reference") ?? "").trim(),
       String(form.get("material") ?? "").trim(), String(form.get("category_id") ?? ""), form.get("active") === "on"],
    );
  }
  if (editPrice) {
    const price = Number(String(form.get("price")).replace(",", "."));
    if (!isNaN(price) && price >= 0) {
      await query("UPDATE products SET price = $2, updated_at = now() WHERE id = $1", [productId, price]);
    }
  }
  revalidatePath(`/products/${productId}`);
}

export async function adjustStock(productId: number, form: FormData) {
  const user = await requireUser("stock.adjust");
  const variantId = Number(form.get("variant_id"));
  const locationId = Number(form.get("location_id"));
  const qty = Math.trunc(Number(form.get("qty")));
  const box = String(form.get("box") ?? "").trim();
  if (!variantId || !locationId || isNaN(qty) || qty < 0) return;

  await transaction(async (db) => {
    const before = await db.query<{ qty: number }>(
      "SELECT qty FROM stock WHERE variant_id = $1 AND location_id = $2 FOR UPDATE", [variantId, locationId]);
    const old = before.rows[0]?.qty ?? 0;
    await db.query(
      `INSERT INTO stock (variant_id, location_id, qty, box) VALUES ($1, $2, $3, nullif($4, ''))
       ON CONFLICT (variant_id, location_id) DO UPDATE SET qty = $3, box = nullif($4, '')`,
      [variantId, locationId, qty, box],
    );
    if (qty !== old) {
      await db.query(
        `INSERT INTO stock_moves (variant_id, from_location, to_location, qty, reason, user_id)
         VALUES ($1, $2, $3, $4, 'adjust', $5)`,
        [variantId, qty < old ? locationId : null, qty > old ? locationId : null, Math.abs(qty - old), user.id],
      );
    }
  });
  revalidatePath(`/products/${productId}`);
}
