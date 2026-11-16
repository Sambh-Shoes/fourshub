"use client";

import { useActionState } from "react";
import { previewPush, pushStockToShopify } from "./actions";

export function PushForm({ syncOn }: { syncOn: boolean }) {
  const [preview, previewAction, previewing] = useActionState(previewPush, null);
  const [pushed, pushAction, pushing] = useActionState(pushStockToShopify, null);
  return (
    <section className="card">
      <h2>Send stock to Shopify</h2>
      <p className="muted small">
        Makes Shopify&apos;s stock equal fourshub&apos;s: each item gets the total of all shops and the warehouse at the
        &quot;Fours Shoes&quot; location, and 0 at the other Shopify locations. Shopify refuses any item whose stock changed
        since it was read, so an online sale is never overwritten.
      </p>

      <form action={previewAction}>
        <button disabled={previewing}>{previewing ? "Reading Shopify…" : "Preview what would change"}</button>
      </form>
      {preview?.error && <p className="error">{preview.error}</p>}
      {preview && !preview.error && (
        <>
          <div className="notice">
            {preview.items?.toLocaleString("es-ES")} items would change ({preview.changes?.toLocaleString("es-ES")} stock changes).
            {preview.notStocked ? ` ${preview.notStocked} have pairs in fourshub but Shopify does not stock them at "Fours Shoes", so they are skipped.` : ""}
            {preview.untracked ? ` ${preview.untracked} are not counted by Shopify and are left alone.` : ""}
          </div>
          {preview.rows && preview.rows.length > 0 && (
            <div className="table-wrap"><table>
              <thead><tr><th>SKU</th><th>Item</th><th>Change</th></tr></thead>
              <tbody>{preview.rows.map((r) => <tr key={r.sku}><td className="small">{r.sku}</td><td>{r.label}</td><td className="small">{r.note}</td></tr>)}</tbody>
            </table></div>
          )}
          {(preview.items ?? 0) > (preview.rows?.length ?? 0) && <p className="muted small">Showing the first {preview.rows?.length}.</p>}
        </>
      )}

      <h3>Send</h3>
      {!syncOn && (
        <div className="notice">
          Sending is switched off. Turn it on only when fourshub&apos;s stock is up to date (a fresh Odoo backup, or after the
          switch from Odoo): set <code>SHOPIFY_SYNC</code> to <code>on</code> in Vercel and redeploy.
        </div>
      )}
      <form action={pushAction}>
        <label>How many items to send (leave empty for all; start with a small test)
          <input name="limit" defaultValue="5" inputMode="numeric" style={{ maxWidth: 120 }} />
        </label>
        <p />
        <label className="check"><input type="checkbox" name="confirm" /> I understand this replaces Shopify&apos;s stock numbers with fourshub&apos;s</label>
        <p><button disabled={pushing || !syncOn}>{pushing ? "Sending… (can take a few minutes)" : "Send stock to Shopify"}</button></p>
      </form>
      {pushed?.error && <p className="error">{pushed.error}</p>}
      {pushed?.summary && <div className="notice">{pushed.summary}</div>}
      {pushed?.problems && pushed.problems.length > 0 && <ul className="small">{pushed.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
    </section>
  );
}
