"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";

/**
 * Sending takes the pairs out of the sending location straight away (they are "on the way").
 * Receiving puts them into the receiving location.
 */
export async function createTransfer(_prev: string | null, form: FormData) {
  const user = await requireUser("transfers.create");
  const from = Number(form.get("from"));
  const to = Number(form.get("to"));
  const note = String(form.get("note") ?? "").trim();
  if (!from || !to || from === to) return "Choose two different places.";

  // One scan per line; a line can also be "barcode x3" or "barcode 3".
  const wanted = new Map<string, number>();
  for (const raw of String(form.get("barcodes") ?? "").split(/\r?\n/)) {
    const m = raw.trim().match(/^(\S+)(?:\s*[x×*]?\s*(\d+))?$/i);
    if (!m) continue;
    wanted.set(m[1], (wanted.get(m[1]) ?? 0) + (m[2] ? Number(m[2]) : 1));
  }
  if (wanted.size === 0) return "Scan at least one shoe.";

  let id = 0;
  try {
    id = await transaction(async (db) => {
      const lines: { variant_id: number; qty: number }[] = [];
      const problems: string[] = [];
      for (const [barcode, qty] of wanted) {
        const r = await db.query<{ id: number; label: string; qty: number | null }>(
          `SELECT v.id, p.name || ' ' || coalesce(v.colour, '') || ' ' || coalesce(v.size, '') AS label, s.qty
             FROM variants v JOIN products p ON p.id = v.product_id
             LEFT JOIN stock s ON s.variant_id = v.id AND s.location_id = $2
            WHERE v.barcode = $1 FOR UPDATE OF v`,
          [barcode, from],
        );
        const v = r.rows[0];
        if (!v) problems.push(`${barcode}: barcode not found`);
        else if ((v.qty ?? 0) < qty) problems.push(`${v.label.trim()}: only ${v.qty ?? 0} in stock, trying to send ${qty}`);
        else lines.push({ variant_id: v.id, qty });
      }
      if (problems.length) throw new Error(problems.join("\n"));

      const t = await db.query<{ id: number }>(
        `INSERT INTO transfers (from_location, to_location, note, created_by) VALUES ($1, $2, nullif($3, ''), $4) RETURNING id`,
        [from, to, note, user.id],
      );
      const tid = t.rows[0].id;
      for (const l of lines) {
        await db.query("INSERT INTO transfer_lines (transfer_id, variant_id, qty) VALUES ($1, $2, $3)", [tid, l.variant_id, l.qty]);
        await db.query("UPDATE stock SET qty = qty - $3 WHERE variant_id = $1 AND location_id = $2", [l.variant_id, from, l.qty]);
        await db.query(
          `INSERT INTO stock_moves (variant_id, from_location, qty, reason, transfer_id, user_id) VALUES ($1, $2, $3, 'transfer', $4, $5)`,
          [l.variant_id, from, l.qty, tid, user.id]);
      }
      return tid;
    });
  } catch (err) {
    return err instanceof Error ? err.message : "Could not save the transfer.";
  }
  revalidatePath("/transfers");
  redirect(`/transfers/${id}`);
}

export async function receiveTransfer(id: number) {
  const user = await requireUser("transfers.receive");
  await finish(id, "received", user.id);
}

export async function cancelTransfer(id: number) {
  const user = await requireUser("transfers.create");
  await finish(id, "cancelled", user.id);
}

async function finish(id: number, status: "received" | "cancelled", userId: number) {
  await transaction(async (db) => {
    const t = await db.query<{ from_location: number; to_location: number }>(
      "SELECT from_location, to_location FROM transfers WHERE id = $1 AND status = 'sent' FOR UPDATE", [id]);
    if (!t.rows[0]) return;
    const target = status === "received" ? t.rows[0].to_location : t.rows[0].from_location;
    const lines = await db.query<{ variant_id: number; qty: number }>(
      "SELECT variant_id, qty FROM transfer_lines WHERE transfer_id = $1", [id]);
    for (const l of lines.rows) {
      await db.query(
        `INSERT INTO stock (variant_id, location_id, qty) VALUES ($1, $2, $3)
         ON CONFLICT (variant_id, location_id) DO UPDATE SET qty = stock.qty + $3`,
        [l.variant_id, target, l.qty]);
      await db.query(
        `INSERT INTO stock_moves (variant_id, to_location, qty, reason, transfer_id, user_id) VALUES ($1, $2, $3, 'transfer', $4, $5)`,
        [l.variant_id, target, l.qty, id, userId]);
    }
    await db.query("UPDATE transfers SET status = $2, received_by = $3, received_at = now() WHERE id = $1", [id, status, userId]);
  });
  revalidatePath(`/transfers/${id}`);
}
