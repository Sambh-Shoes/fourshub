"use client";

import { useActionState } from "react";
import { applyOrders, previewOrders } from "./orderActions";

export function OrdersForm({ ordersOn, from }: { ordersOn: boolean; from: string | null }) {
  const [preview, previewAction, previewing] = useActionState(previewOrders, null);
  const [applied, applyAction, applying] = useActionState(applyOrders, null);
  return (
    <section className="card">
      <h2>Online orders</h2>
      <p className="muted small">
        Takes the pairs of online orders out of fourshub&apos;s stock: from the warehouse first, then from the shop with the most
        pairs of that item. A cancelled order, or a returned pair, puts the pairs back where they came from. Each order is
        applied once. Orders from before {from ?? "the cut-over day"} are already in the Odoo stock and are ignored.
      </p>

      <form action={previewAction}>
        <button disabled={previewing}>{previewing ? "Reading Shopify…" : "Preview the orders"}</button>
      </form>
      {preview?.error && <p className="error">{preview.error}</p>}
      {preview && !preview.error && (
        <>
          <div className="notice">
            {preview.orders} orders would change stock: {preview.take} pairs taken, {preview.putBack} returned
            {preview.missing ? `, ${preview.missing} not found in any location` : ""}.
          </div>
          {preview.unknownSku && preview.unknownSku.length > 0 && (
            <p className="error small">Not matched to an item in fourshub: {preview.unknownSku.slice(0, 20).join(", ")}</p>
          )}
          {preview.rows && preview.rows.length > 0 && (
            <div className="table-wrap"><table>
              <thead><tr><th>Order</th><th>SKU</th><th></th><th>Change</th></tr></thead>
              <tbody>{preview.rows.map((r, i) => <tr key={`${r.order}-${r.sku}-${i}`}><td className="small">{r.order}</td><td className="small">{r.sku}</td><td className="small">{r.item}</td><td className="small">{r.note}</td></tr>)}</tbody>
            </table></div>
          )}
        </>
      )}

      <h3>Apply</h3>
      {!ordersOn && (
        <div className="notice">
          Applying is switched off. Turn it on the day you stop using Odoo: set <code>SHOPIFY_ORDERS_FROM</code> to that day and{" "}
          <code>SHOPIFY_ORDERS</code> to <code>on</code> in Vercel, then redeploy.
        </div>
      )}
      <form action={applyAction}>
        <label className="check"><input type="checkbox" name="confirm" /> I understand this changes fourshub&apos;s stock</label>
        <p><button disabled={applying || !ordersOn}>{applying ? "Applying…" : "Apply the orders"}</button></p>
      </form>
      {applied?.error && <p className="error">{applied.error}</p>}
      {applied?.summary && <div className="notice">{applied.summary}</div>}
    </section>
  );
}
