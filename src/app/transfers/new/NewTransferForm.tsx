"use client";

import { useActionState } from "react";
import { createTransfer } from "../actions";
import type { Location } from "@/lib/data";

export function NewTransferForm({ locations, defaultFrom }: { locations: Location[]; defaultFrom?: number }) {
  const [state, action, pending] = useActionState(createTransfer, null);
  const v = state?.values;
  return (
    <form action={action} className="card">
      <div className="row">
        <label>From
          <select key={`f${v?.from}`} name="from" defaultValue={v?.from ?? defaultFrom}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <label>To
          <select key={`t${v?.to}`} name="to" defaultValue={v?.to ?? ""}>
            <option value="" disabled>Choose…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}>Note (optional)<input name="note" defaultValue={v?.note} placeholder="e.g. for customer reservation" /></label>
      </div>
      <p />
      <label>Scan each pair (one barcode per line). Scanning the same pair twice sends 2.
        <textarea key={state ? JSON.stringify(state) : "new"} name="barcodes" autoFocus defaultValue={v?.barcodes} />
      </label>
      {state?.error && <pre className="error small" style={{ whiteSpace: "pre-wrap" }}>{state.error}</pre>}
      <p><button disabled={pending}>{pending ? "Sending…" : "Send"}</button></p>
    </form>
  );
}
