"use client";

import { useActionState } from "react";
import { importOdoo } from "./actions";

export function ImportForm() {
  const [state, action, pending] = useActionState(importOdoo, null);
  return (
    <form action={action} className="card">
      <label>The Odoo file (a .tgz with the product, variant, attribute, category and stock tables, for example fourshub-odoo-products-2026-10-23-clean.tgz)
        <input type="file" name="file" accept=".tgz,.gz,application/gzip" required />
      </label>
      <p />
      <label className="check"><input type="checkbox" name="confirm" /> I understand this replaces all products, stock and transfers in fourshub</label>
      <p><button disabled={pending}>{pending ? "Loading… (about a minute)" : "Load products and stock"}</button></p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.summary && <div className="notice">{state.summary}</div>}
    </form>
  );
}
