"use client";

import { useActionState } from "react";
import { loadPictures } from "./actions";

export function PicturesForm() {
  const [state, action, busy] = useActionState(loadPictures, null);
  return (
    <section className="card">
      <h2>Shoe pictures</h2>
      <p className="muted small">Reads each item&apos;s photo from Shopify (matched by SKU) so the till and the product list can show it. It only reads; nothing changes in Shopify. Run it again after new photos are added.</p>
      <form action={action}><button disabled={busy}>{busy ? "Reading Shopify…" : "Load pictures from Shopify"}</button></form>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.loaded !== undefined && <div className="notice">{state.loaded.toLocaleString("es-ES")} pictures read; {state.matched?.toLocaleString("es-ES")} of your items now have one.</div>}
    </section>
  );
}
