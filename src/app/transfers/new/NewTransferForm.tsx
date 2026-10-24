"use client";

import { useActionState } from "react";
import { createTransfer } from "../actions";
import type { Location } from "@/lib/data";

export function NewTransferForm({ locations, defaultFrom }: { locations: Location[]; defaultFrom?: number }) {
  const [error, action, pending] = useActionState(createTransfer, null);
  return (
    <form action={action} className="card">
      <div className="row">
        <label>From
          <select name="from" defaultValue={defaultFrom}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <label>To
          <select name="to" defaultValue="">
            <option value="" disabled>Choose…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}>Note (optional)<input name="note" placeholder="e.g. for customer reservation" /></label>
      </div>
      <p />
      <label>Scan each pair (one barcode per line). Scanning the same pair twice sends 2.
        <textarea name="barcodes" autoFocus />
      </label>
      {error && <pre className="error small" style={{ whiteSpace: "pre-wrap" }}>{error}</pre>}
      <p><button disabled={pending}>{pending ? "Sending…" : "Send"}</button></p>
    </form>
  );
}
