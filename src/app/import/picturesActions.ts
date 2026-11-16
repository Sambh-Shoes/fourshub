"use server";

import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { readTgzBinary } from "@/lib/tar";

export type PicturesState = { error?: string; summary?: string } | null;

/** Loads one part of the picture files (odoo-pictures-N.tgz). Safe to repeat: a picture is replaced by id. */
export async function importPictures(_prev: PicturesState, form: FormData): Promise<PicturesState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file first." };
  try {
    const files = readTgzBinary(Buffer.from(await file.arrayBuffer()));
    const pics: { id: number; mime: string; data: Buffer }[] = [];
    for (const [name, data] of Object.entries(files)) {
      const m = name.match(/(?:^|\/)(\d+)\.(jpg|png)$/);
      if (!m || m[0].includes("/._") || data.length === 0) continue;
      pics.push({ id: Number(m[1]), mime: m[2] === "png" ? "image/png" : "image/jpeg", data });
    }
    for (let i = 0; i < pics.length; i += 40) { // 40 pictures per round trip: much faster than one by one
      const part = pics.slice(i, i + 40);
      await query(
        `INSERT INTO product_images (odoo_id, mime, data) VALUES ${part.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(", ")}
         ON CONFLICT (odoo_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data`,
        part.flatMap((x) => [x.id, x.mime, x.data]));
    }
    const loaded = pics.length;
    const total = await query<{ n: number; matched: number }>(
      "SELECT count(*)::int AS n, (SELECT count(*)::int FROM products p JOIN product_images i ON i.odoo_id = p.odoo_id) AS matched FROM product_images");
    return { summary: `Loaded ${loaded} pictures from this file. In all: ${total[0].n} pictures, ${total[0].matched} of them match a product in fourshub.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The import failed." };
  }
}
