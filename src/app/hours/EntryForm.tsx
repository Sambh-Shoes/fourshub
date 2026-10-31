"use client";

import { useActionState } from "react";
import { saveEntry } from "./actions";

/** Inline form to correct one entry (or add a missing one). */
export function EntryForm({ entryId, userId, clockIn, clockOut }: {
  entryId: number | null; userId: number; clockIn?: string; clockOut?: string;
}) {
  const [state, action, pending] = useActionState(saveEntry.bind(null, entryId, userId), null);
  return (
    <form action={action} className="row" style={{ gap: 6 }}>
      <input type="datetime-local" name="clock_in" defaultValue={clockIn} required />
      <input type="datetime-local" name="clock_out" defaultValue={clockOut} />
      <input name="reason" placeholder="Reason, e.g. forgot to clock out" style={{ minWidth: 200 }} />
      <button className="secondary" disabled={pending}>{entryId ? "Correct" : "Add"}</button>
      {state?.error && <span className="error small">{state.error}</span>}
      {state?.ok && <span className="small">Saved.</span>}
    </form>
  );
}
