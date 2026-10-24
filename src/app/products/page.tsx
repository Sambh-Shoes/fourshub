import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { getCategories, getLocations } from "@/lib/data";
import { euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type Search = { q?: string; cat?: string; instock?: string; inactive?: string; page?: string };

export default async function Products({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  // A scanned barcode goes straight to its product.
  if (q && /^\d{6,}$/.test(q)) {
    const hit = await one<{ product_id: number }>("SELECT product_id FROM variants WHERE barcode = $1", [q]);
    if (hit) redirect(`/products/${hit.product_id}?barcode=${q}`);
  }

  const [locations, categories] = await Promise.all([getLocations(), getCategories()]);
  const rows = await query<{
    id: number; name: string; reference: string | null; category: string | null; price: string;
    active: boolean; colours: string | null; stock: Record<string, number> | null; total: string;
  }>(
    `SELECT p.id, p.name, p.reference, c.name AS category, p.price, p.active,
            (SELECT string_agg(DISTINCT v.colour, ', ') FROM variants v WHERE v.product_id = p.id) AS colours,
            (SELECT jsonb_object_agg(x.location_id, x.qty) FROM (
               SELECT s.location_id, sum(s.qty) AS qty FROM stock s JOIN variants v ON v.id = s.variant_id
                WHERE v.product_id = p.id GROUP BY s.location_id) x) AS stock,
            (SELECT coalesce(sum(s.qty), 0) FROM stock s JOIN variants v ON v.id = s.variant_id
              WHERE v.product_id = p.id AND s.qty > 0) AS total
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
      WHERE ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.reference ILIKE '%' || $1 || '%'
             OR EXISTS (SELECT 1 FROM variants v WHERE v.product_id = p.id AND v.barcode = $1))
        AND ($2::int IS NULL OR p.category_id = $2)
        AND ($3 OR p.active)
        AND (NOT $4 OR EXISTS (SELECT 1 FROM stock s JOIN variants v ON v.id = s.variant_id
                               WHERE v.product_id = p.id AND s.qty > 0))
      ORDER BY p.active DESC, p.name
      LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`,
    [q, sp.cat ? Number(sp.cat) : null, sp.inactive === "1", sp.instock === "1"],
  );
  const more = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const link = (p: number) => `/products?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`;

  return (
    <Page user={user} active="/products">
      <h1>Products</h1>
      <form className="card row">
        <label style={{ flex: 1, minWidth: 220 }}>Name, reference or barcode<input name="q" defaultValue={q} autoFocus /></label>
        <label>Category
          <select name="cat" defaultValue={sp.cat ?? ""}>
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="instock" value="1" defaultChecked={sp.instock === "1"} /> Only in stock</label>
        <label className="check"><input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === "1"} /> Show archived</label>
        <button>Search</button>
      </form>

      <div className="table-wrap"><table>
        <thead><tr>
          <th>Model</th><th>Category</th><th>Colours</th><th className="num">Price</th>
          {locations.map((l) => <th key={l.id} className="num" title={l.name}>{l.code}</th>)}
          <th className="num">Total</th>
        </tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td>
                <Link href={`/products/${p.id}`}>{p.name}</Link>
                {p.reference && <div className="muted small">{p.reference}</div>}
                {!p.active && <span className="badge off">archived</span>}
              </td>
              <td className="small">{p.category}</td>
              <td className="small">{p.colours}</td>
              <td className="num">{euro(p.price)}</td>
              {locations.map((l) => {
                const n = p.stock?.[l.id] ?? 0;
                return <td key={l.id} className="num" style={n > 0 ? {} : { color: "var(--zero)" }}>{n}</td>;
              })}
              <td className="num"><b>{p.total}</b></td>
            </tr>
          ))}
          {shown.length === 0 && <tr><td colSpan={5 + locations.length} className="muted">No products found.</td></tr>}
        </tbody>
      </table></div>
      <p className="row">
        {page > 1 && <Link className="button secondary" href={link(page - 1)}>← Previous</Link>}
        {more && <Link className="button secondary" href={link(page + 1)}>Next →</Link>}
      </p>
    </Page>
  );
}
