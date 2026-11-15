"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { TZ } from "@/lib/hours";

export async function clockIn() {
  const user = await requireUser();
  await query(
    `INSERT INTO time_entries (user_id, location_id, clock_in, created_by) VALUES ($1, $2, now(), $1)
     ON CONFLICT (user_id) WHERE clock_out IS NULL DO NOTHING`,
    [user.id, user.location_id]);
  revalidatePath("/");
  revalidatePath("/hours");
}

export async function clockOut() {
  const user = await requireUser();
  await query("UPDATE time_entries SET clock_out = now() WHERE user_id = $1 AND clock_out IS NULL", [user.id]);
  revalidatePath("/");
  revalidatePath("/hours");
}

export type EntryFormState = { error?: string; ok?: boolean } | null;

/** A manager corrects an entry, or adds a forgotten one. Times are typed in shop time. */
export async function saveEntry(entryId: number | null, userId: number, _prev: EntryFormState, form: FormData): Promise<EntryFormState> {
  const me = await requireUser("hours.manage");
  const clockIn = String(form.get("clock_in") ?? "");
  const clockOut = String(form.get("clock_out") ?? "");
  const reason = String(form.get("reason") ?? "").trim();
  if (!clockIn) return { error: "Start time is needed." };
  if (clockOut && clockOut <= clockIn) return { error: "End must be after start." };
  if (!reason) return { error: "Write why it is changed (the law asks for it)." };

  try {
    await transaction(async (db) => {
      let id = entryId;
      let old: { clock_in: Date | null; clock_out: Date | null } = { clock_in: null, clock_out: null };
      if (id) {
        const r = await db.query("SELECT clock_in, clock_out FROM time_entries WHERE id = $1 AND user_id = $2 FOR UPDATE", [id, userId]);
        if (!r.rows[0]) throw new Error("Entry not found.");
        old = r.rows[0];
        await db.query(
          `UPDATE time_entries SET clock_in = ($2::timestamp AT TIME ZONE '${TZ}'),
                  clock_out = (nullif($3, '')::timestamp AT TIME ZONE '${TZ}') WHERE id = $1`,
          [id, clockIn, clockOut]);
      } else {
        const r = await db.query<{ id: number }>(
          `INSERT INTO time_entries (user_id, location_id, clock_in, clock_out, created_by)
           SELECT $1, location_id, ($2::timestamp AT TIME ZONE '${TZ}'), (nullif($3, '')::timestamp AT TIME ZONE '${TZ}'), $4
             FROM users WHERE id = $1 RETURNING id`,
          [userId, clockIn, clockOut, me.id]);
        id = r.rows[0].id;
      }
      await db.query(
        `INSERT INTO time_entry_changes (entry_id, old_in, old_out, new_in, new_out, reason, changed_by)
         SELECT $1, $2, $3, clock_in, clock_out, $4, $5 FROM time_entries WHERE id = $1`,
        [id, old.clock_in, old.clock_out, reason, me.id]);
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return { error: msg.includes("time_entries_open_idx") ? "This person already has an open entry (still clocked in)." : msg || "Could not save." };
  }
  revalidatePath("/hours");
  return { ok: true };
}
