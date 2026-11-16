import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { getCategories, getLocations } from "@/lib/data";
import { euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";
import { getT } from "@/lib/lang";
import { can } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

type Search = { q?: string; cat?: string; instock?: string; inactive?: string; page?: string; view?: string };

export default async function Products({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const t = await getT();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);

  // A scanned barcode goes straight to its product.
  if (q && /^\d{6,}$/.test(q)) {
    const hit = await one<{ product_id: number }>(
      `SELECT product_id FROM variants WHERE barcode = $1
        OR id = (SELECT variant_id FROM barcode_aliases WHERE barcode = $1) LIMIT 1`, [q]);
    if (hit) redirect(`/products/${hit.product_id}?barcode=${q}`);
  }

  const [locations, categories] = await Promise.all([getLocations(), getCategories()]);
  const rows = await query<{
    id: number; name: string; reference: string | null; category: string | null; price: string;
    active: boolean; image: number | null; colours: string | null; stock: Record<string, number> | null; total: string;
  }>(
    `SELECT p.id, p.name, p.reference, c.name AS category, p.price, p.active,
            (SELECT i.odoo_id FROM product_images i WHERE i.odoo_id = p.odoo_id) AS image,
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
  const tiles = sp.view === "tiles";
  const viewLink = (v: string) => `/products?${new URLSearchParams({ ...sp, view: v, page: "1" } as Record<string, string>)}`;
  const link = (p: number) => `/products?${new URLSearchParams({ ...sp, page: String(p) } as Record<string, string>)}`;

  return (
    <Page user={user} active="/products">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>{t("Products")}</h1>
        <div className="row">
          <span className="seg">
            <Link className={tiles ? "" : "on"} href={viewLink("list")}>{t("List")}</Link>
            <Link className={tiles ? "on" : ""} href={viewLink("tiles")}>{t("Tiles")}</Link>
          </span>
          {can(user, "products.edit") && <Link className="button" href="/products/new">{t("New product")}</Link>}
        </div>
      </div>
      <form className="card row">
        {tiles && <input type="hidden" name="view" value="tiles" />}
        <label style={{ flex: 1, minWidth: 220 }}>{t("Name, reference or barcode")}<input name="q" defaultValue={q} autoFocus /></label>
        <label>{t("Category")}
          <select name="cat" defaultValue={sp.cat ?? ""}>
            <option value="">{t("All")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" name="instock" value="1" defaultChecked={sp.instock === "1"} /> {t("Only in stock")}</label>
        <label className="check"><input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === "1"} /> {t("Show archived")}</label>
        <button>{t("Search")}</button>
      </form>

      {tiles && (
        <div className="tiles">
          {shown.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className="tile">
              {p.image ? <img src={`/img/${p.image}`} alt="" loading="lazy" /> : <div className="tile-none">{t("no picture")}</div>}
              <div className="tile-body">
                <b>{p.name}</b>
                {p.reference && <div className="muted small">{p.reference}</div>}
                <div className="small">{p.colours}</div>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span>{euro(p.price)}</span>
                  <span className={Number(p.total) > 0 ? "" : "muted"}>{Number(p.total) === 1 ? t("1 pair") : t("{n} pairs", { n: p.total })}</span>
                </div>
                {!p.active && <span className="badge off">{t("archived")}</span>}
              </div>
            </Link>
          ))}
          {shown.length === 0 && <p className="muted">{t("No products found.")}</p>}
        </div>
      )}
      {!tiles && <div className="table-wrap"><table>
        <thead><tr>
          <th>{t("Model")}</th><th>{t("Category")}</th><th>{t("Colours")}</th><th className="num">{t("Price")}</th>
          {locations.map((l) => <th key={l.id} className="num" title={l.name}>{l.code}</th>)}
          <th className="num">{t("Total")}</th>
        </tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id}>
              <td>
                <div className="till-item">
                  {p.image && <img className="thumb" src={`/img/${p.image}`} alt="" loading="lazy" />}
                  <div>
                    <Link href={`/products/${p.id}`}>{p.name}</Link>
                    {p.reference && <div className="muted small">{p.reference}</div>}
                    {!p.active && <span className="badge off">{t("archived")}</span>}
                  </div>
                </div>
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
          {shown.length === 0 && <tr><td colSpan={5 + locations.length} className="muted">{t("No products found.")}</td></tr>}
        </tbody>
      </table></div>}
      <p className="row">
        {page > 1 && <Link className="button secondary" href={link(page - 1)}>← {t("Previous")}</Link>}
        {more && <Link className="button secondary" href={link(page + 1)}>{t("Next")} →</Link>}
      </p>
    </Page>
  );
}
