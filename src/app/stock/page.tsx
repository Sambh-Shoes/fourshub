import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { getLocations } from "@/lib/data";
import { compareSizes } from "@/lib/sizes";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ loc?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const locations = await getLocations();
  const locId = Number(sp.loc) || user.location_id || locations[0]?.id;
  const q = (sp.q ?? "").trim();

  const rows = await query<{
    product_id: number; name: string; reference: string | null; colour: string | null;
    sizes: { size: string | null; qty: number; box: string | null }[]; pairs: string;
  }>(
    `SELECT p.id AS product_id, p.name, p.reference, v.colour,
            jsonb_agg(jsonb_build_object('size', v.size, 'qty', s.qty, 'box', s.box)) AS sizes,
            sum(s.qty) AS pairs
       FROM stock s JOIN variants v ON v.id = s.variant_id JOIN products p ON p.id = v.product_id
      WHERE s.location_id = $1 AND s.qty > 0
        AND ($2 = '' OR p.name ILIKE '%' || $2 || '%' OR p.reference ILIKE '%' || $2 || '%' OR s.box = $2)
      GROUP BY p.id, v.colour ORDER BY p.name, v.colour LIMIT 2000`,
    [locId, q],
  );
  const total = rows.reduce((n, r) => n + Number(r.pairs), 0);

  return (
    <Page user={user} active="/stock">
      <h1>Stock</h1>
      <form className="card row">
        <label>Where
          <select name="loc" defaultValue={locId}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}>Name, reference or box number<input name="q" defaultValue={q} /></label>
        <button>Show</button>
      </form>
      <p className="muted">{rows.length} models/colours · {total.toLocaleString("es-ES")} pairs{rows.length === 2000 ? " (first 2000 shown, search to narrow)" : ""}</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Model</th><th>Colour</th><th>Sizes available (pairs)</th><th>Box</th><th className="num">Pairs</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const sizes = [...r.sizes].sort((a, b) => compareSizes(a.size, b.size));
            const boxes = [...new Set(sizes.map((s) => s.box).filter(Boolean))];
            return (
              <tr key={`${r.product_id}-${r.colour}`}>
                <td><Link href={`/products/${r.product_id}`}>{r.name}</Link>{r.reference && <div className="muted small">{r.reference}</div>}</td>
                <td>{r.colour}</td>
                <td>{sizes.map((s) => <span key={s.size} className="badge" style={{ marginRight: 4 }}>{s.size ?? "–"}{s.qty > 1 ? ` ×${s.qty}` : ""}</span>)}</td>
                <td className="small">{boxes.join(", ")}</td>
                <td className="num">{r.pairs}</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={5} className="muted">No stock here.</td></tr>}
        </tbody>
      </table></div>
    </Page>
  );
}
