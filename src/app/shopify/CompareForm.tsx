"use client";

import { useActionState } from "react";
import { runComparison } from "./actions";
import type { Row } from "@/lib/shopifyCompare";

function RowsTable({ title, hint, total, rows, extra }: { title: string; hint: string; total: number; rows: Row[]; extra?: string }) {
  return (
    <section className="card">
      <h2>{title} <span className="badge">{total.toLocaleString("es-ES")}</span></h2>
      <p className="muted small">{hint}{extra ? ` ${extra}` : ""}</p>
      {total === 0 ? <p className="muted">None.</p> : (
        <div className="table-wrap"><table>
          <thead><tr><th>SKU</th><th>Item</th><th>Detail</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={`${r.sku}-${i}`}><td className="small">{r.sku || "–"}</td><td>{r.label}</td><td className="small">{r.note}</td></tr>)}</tbody>
        </table></div>
      )}
      {total > rows.length && <p className="muted small">Showing the first {rows.length} of {total.toLocaleString("es-ES")}.</p>}
    </section>
  );
}

export function CompareForm() {
  const [state, action, pending] = useActionState(runComparison, null);
  const r = state?.result;
  return (
    <>
      <form action={action} className="card">
        <p>Reads every item from Shopify and from fourshub and lists the differences. It changes nothing in either place.</p>
        <p><button disabled={pending}>{pending ? "Reading Shopify… (up to a minute or two)" : "Compare with Shopify"}</button></p>
        {state?.error && <p className="error">{state.error}</p>}
      </form>

      {r && (
        <>
          <div className="notice">
            Checked in {state?.seconds}s. Shopify has {r.shopifyVariants.toLocaleString("es-ES")} items, fourshub has {r.foursVariants.toLocaleString("es-ES")}.
            {" "}{r.matched.toLocaleString("es-ES")} match by SKU: {r.stockSame.toLocaleString("es-ES")} with the same total stock, {r.stockDiffers.toLocaleString("es-ES")} with a different total.
            {r.unknownLocations.length > 0 && <> Shopify locations not linked to a shop: {r.unknownLocations.join(", ")}.</>}
          </div>
          <RowsTable title="Different stock" hint="Same SKU, but the total pairs differ. The online shop sells the total of all shops and the warehouse." total={r.stockDiffs.total} rows={r.stockDiffs.rows} />
          <RowsTable title="Only in Shopify" hint="SKU is in Shopify but not in fourshub." total={r.onlyShopify.total} rows={r.onlyShopify.rows} />
          <RowsTable
            title="In fourshub with stock, not in Shopify"
            hint="Items with pairs in a shop or the warehouse that Shopify does not list."
            extra={`${r.onlyFourshubInStock.pairs.toLocaleString("es-ES")} pairs in total.`}
            total={r.onlyFourshubInStock.total} rows={r.onlyFourshubInStock.rows}
          />
          <RowsTable title="Shopify items without a SKU" hint="These cannot be matched until they get a SKU." total={r.shopifyNoSku.total} rows={r.shopifyNoSku.rows} />
          <RowsTable title="SKU used twice in Shopify" hint="Only the first one is compared." total={r.duplicateSkus.total} rows={r.duplicateSkus.rows} />
        </>
      )}
    </>
  );
}
