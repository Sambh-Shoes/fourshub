"use client";

import { useActionState } from "react";
import { importSales } from "./salesActions";

export function SalesImportForm() {
  const [state, action, pending] = useActionState(importSales, null);
  return (
    <form action={action} className="card">
      <h2>Customers and sales</h2>
      <p className="muted small">
        Loads the named customers with their loyalty points, and the shops&apos; sales history (tickets, lines and payments) as
        read-only records for the Sales and Customers screens. Products and stock are not touched.
      </p>
      <label>The sales file (odoo-sales.tgz, made from the same Odoo backup)
        <input type="file" name="file" accept=".tgz,.gz,application/gzip" required />
      </label>
      <p />
      <label className="check"><input type="checkbox" name="confirm" /> I understand this replaces the customers and sales already in fourshub</label>
      <p><button disabled={pending}>{pending ? "Loading… (about a minute)" : "Load customers and sales"}</button></p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.summary && <div className="notice">{state.summary}</div>}
      {state?.notes && state.notes.length > 0 && <ul className="small">{state.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </form>
  );
}
