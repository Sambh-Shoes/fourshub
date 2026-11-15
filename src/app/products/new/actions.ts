"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { can } from "@/lib/permissions";
import { compareSizes } from "@/lib/sizes";
import { nextBarcodes } from "@/lib/barcodes";

export type ProductFormState = { error: string; values: Record<string, string> } | null;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function readSizesAndColours(form: FormData) {
  const sizes = form.getAll("size").map(String).filter(Boolean).sort(compareSizes);
  const colours = [...new Set(String(form.get("colours") ?? "").split(",").map((c) => cap(c.trim().replace(/\s+/g, " "))).filter(Boolean))];
  return { sizes, colours: colours.length ? colours : [null] };
}

/**
 * Creates every colour × size combination that doesn't exist yet, each with its own new barcode,
 * and optionally puts starting pairs in one location.
 */
async function addVariants(db: PoolClient, productId: number, form: FormData, userId: number) {
  const { sizes, colours } = readSizesAndColours(form);
  const existing = await db.query<{ size: string | null; colour: string | null }>(
    "SELECT size, colour FROM variants WHERE product_id = $1", [productId]);
  const has = new Set(existing.rows.map((v) => `${v.size}\u0000${v.colour}`));
  const todo = colours.flatMap((colour) => sizes.map((size) => ({ size, colour }))).filter((v) => !has.has(`${v.size}\u0000${v.colour}`));
  const barcodes = await nextBarcodes(db, todo.length);
  const locationId = Number(form.get("location_id")) || null;
  const box = String(form.get("box") ?? "").trim() || null;

  for (const [i, v] of todo.entries()) {
    const r = await db.query<{ id: number }>(
      "INSERT INTO variants (product_id, size, colour, barcode) VALUES ($1, $2, $3, $4) RETURNING id",
      [productId, v.size, v.colour, barcodes[i]]);
    const qty = Math.max(0, Math.trunc(Number(form.get(`qty:${(v.colour ?? "").toLowerCase()}:${v.size}`)) || 0));
    if (locationId && (qty > 0 || box)) {
      await db.query("INSERT INTO stock (variant_id, location_id, qty, box) VALUES ($1, $2, $3, $4)", [r.rows[0].id, locationId, qty, box]);
      if (qty > 0) {
        await db.query(`INSERT INTO stock_moves (variant_id, to_location, qty, reason, user_id) VALUES ($1, $2, $3, 'new', $4)`,
          [r.rows[0].id, locationId, qty, userId]);
      }
    }
  }
  return todo.length;
}

export async function createProduct(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const user = await requireUser("products.edit");
  const values = Object.fromEntries(["name", "reference", "category_id", "material", "price", "colours", "location_id", "box"]
    .map((k) => [k, String(form.get(k) ?? "")]));
  values.sizes = form.getAll("size").join(",");
  const fail = (error: string) => ({ error, values });

  const name = values.name.trim();
  const price = can(user, "prices.edit") ? Number(values.price.replace(",", ".")) : 0;
  if (!name) return fail("Give the product a name or model number.");
  if (isNaN(price) || price < 0) return fail("The price doesn't look right.");
  if (form.getAll("size").length === 0) return fail("Tick at least one size.");

  const id = await transaction(async (db) => {
    const p = await db.query<{ id: number }>(
      `INSERT INTO products (name, reference, category_id, material, price) VALUES ($1, nullif($2, ''), nullif($3, '')::int, nullif($4, ''), $5) RETURNING id`,
      [name, values.reference.trim(), values.category_id, cap(values.material.trim()), price]);
    await addVariants(db, p.rows[0].id, form, user.id);
    return p.rows[0].id;
  });
  revalidatePath("/products");
  redirect(`/products/${id}?created=1`);
}

export async function addSizes(productId: number, _prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const user = await requireUser("products.edit");
  const values = { colours: String(form.get("colours") ?? ""), sizes: form.getAll("size").join(","),
    location_id: String(form.get("location_id") ?? ""), box: String(form.get("box") ?? "") };
  if (form.getAll("size").length === 0) return { error: "Tick at least one size.", values };
  const added = await transaction((db) => addVariants(db, productId, form, user.id));
  if (added === 0) return { error: "Those sizes already exist.", values };
  revalidatePath(`/products/${productId}`);
  redirect(`/products/${productId}?added=${added}`);
}
