"use client";

import { useActionState } from "react";
import { importPictures } from "./picturesActions";

export function PicturesImportForm() {
  const [state, action, pending] = useActionState(importPictures, null);
  return (
    <form action={action} className="card">
      <h2>Shoe pictures</h2>
      <p className="muted small">
        Loads the product pictures from Odoo. They come in several small files (odoo-pictures-1.tgz, -2.tgz, …): load them one
        at a time. Loading a file again is harmless. Products and stock are not touched.
      </p>
      <label>A picture file
        <input type="file" name="file" accept=".tgz,.gz,application/gzip" required />
      </label>
      <p><button disabled={pending}>{pending ? "Loading…" : "Load pictures"}</button></p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.summary && <div className="notice">{state.summary}</div>}
    </form>
  );
}
