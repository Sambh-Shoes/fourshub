import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { getCategories, getLocations } from "@/lib/data";
import { can } from "@/lib/permissions";
import { compareSizes, euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";
import { adjustStock, saveProduct } from "./actions";

export const dynamic = "force-dynamic";

type Variant = { id: number; size: string | null; colour: string | null; barcode: string | null; price: string | null; active: boolean };
type StockRow = { variant_id: number; location_id: number; qty: number; box: string | null };

export default async function ProductPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ barcode?: string }>;
}) {
  const user = await requireUser();
  const id = Number((await params).id);
  const { barcode } = await searchParams;
  const product = await one<{
    id: number; name: string; reference: string | null; material: string | null; price: string;
    cost: string | null; active: boolean; category_id: number | null; category: string | null;
  }>(
    `SELECT p.*, c.name AS category FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1`, [id]);
  if (!product) notFound();

  const [locations, categories, variants, stock] = await Promise.all([
    getLocations(),
    getCategories(),
    query<Variant>("SELECT id, size, colour, barcode, price, active FROM variants WHERE product_id = $1", [id]),
    query<StockRow>(
      `SELECT s.variant_id, s.location_id, s.qty, s.box FROM stock s JOIN variants v ON v.id = s.variant_id
        WHERE v.product_id = $1`, [id]),
  ]);
  variants.sort((a, b) => (a.colour ?? "").localeCompare(b.colour ?? "") || compareSizes(a.size, b.size));
  const stockOf = (v: number, l: number) => stock.find((s) => s.variant_id === v && s.location_id === l);
  const colours = [...new Set(variants.map((v) => v.colour ?? ""))];
  const scanned = variants.find((v) => v.barcode === barcode);

  const editInfo = can(user, "products.edit");
  const editPrice = can(user, "prices.edit");

  return (
    <Page user={user} active="/products">
      <p className="small"><Link href="/products">← All products</Link></p>
      <h1>{product.name} {!product.active && <span className="badge off">archived</span>}</h1>
      <p className="muted">
        {[product.reference, product.category, product.material].filter(Boolean).join(" · ")}
        {" · "}<b style={{ color: "var(--text)" }}>{euro(product.price)}</b>
      </p>
      {scanned && (
        <div className="notice">
          Scanned: size <b>{scanned.size ?? "–"}</b>{scanned.colour ? `, ${scanned.colour}` : ""}. Stock: {" "}
          {locations.map((l) => `${l.code} ${stockOf(scanned.id, l.id)?.qty ?? 0}`).join(" · ")}
        </div>
      )}

      {colours.map((colour) => {
        const vs = variants.filter((v) => (v.colour ?? "") === colour);
        return (
          <div key={colour} className="card">
            <h2 style={{ marginTop: 0 }}>{colour || "No colour"}</h2>
            <div className="table-wrap"><table className="sizes">
              <thead><tr><th className="loc">Size</th>{vs.map((v) => <th key={v.id}>{v.size ?? "–"}</th>)}</tr></thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.id}>
                    <td className="loc">{l.name}</td>
                    {vs.map((v) => {
                      const s = stockOf(v.id, l.id);
                      const qty = s?.qty ?? 0;
                      return (
                        <td key={v.id} className={qty > 0 ? "have" : "zero"}>
                          {qty}{s?.box && qty > 0 && <span className="box">box {s.box}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="total">
                  <td className="loc">All</td>
                  {vs.map((v) => <td key={v.id}>{stock.filter((s) => s.variant_id === v.id).reduce((n, s) => n + s.qty, 0)}</td>)}
                </tr>
              </tbody>
            </table></div>
          </div>
        );
      })}
      {variants.length === 0 && <p className="muted">This product has no sizes yet.</p>}

      {(editInfo || editPrice) && (
        <form action={saveProduct.bind(null, id)} className="card">
          <h2 style={{ marginTop: 0 }}>Edit product</h2>
          <div className="row">
            <label style={{ flex: 2, minWidth: 220 }}>Name<input name="name" defaultValue={product.name} disabled={!editInfo} required /></label>
            <label>Reference<input name="reference" defaultValue={product.reference ?? ""} disabled={!editInfo} /></label>
            <label>Material<input name="material" defaultValue={product.material ?? ""} disabled={!editInfo} /></label>
            <label>Category
              <select name="category_id" defaultValue={product.category_id ?? ""} disabled={!editInfo}>
                <option value="">–</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label>Price (€, with VAT)<input name="price" defaultValue={product.price} disabled={!editPrice} inputMode="decimal" style={{ width: 110 }} /></label>
            <label className="check"><input type="checkbox" name="active" defaultChecked={product.active} disabled={!editInfo} /> On sale</label>
            <button>Save</button>
          </div>
        </form>
      )}

      {can(user, "stock.adjust") && variants.length > 0 && (
        <form action={adjustStock.bind(null, id)} className="card">
          <h2 style={{ marginTop: 0 }}>Correct a stock count</h2>
          <p className="muted small">Use this after counting. Every change is saved with your name.</p>
          <div className="row">
            <label>Size
              <select name="variant_id" defaultValue={scanned?.id}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.size ?? "–"}{v.colour ? ` · ${v.colour}` : ""}</option>)}
              </select>
            </label>
            <label>Where
              <select name="location_id" defaultValue={user.location_id ?? undefined}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Pairs counted<input name="qty" type="number" min={0} required style={{ width: 90 }} /></label>
            <label>Box<input name="box" style={{ width: 90 }} /></label>
            <button>Save count</button>
          </div>
        </form>
      )}

      <h2>Sizes and barcodes</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Colour</th><th>Size</th><th>Barcode</th><th className="num">Price</th></tr></thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} style={v.barcode === barcode ? { background: "var(--warn-soft)" } : {}}>
              <td>{v.colour}</td><td>{v.size}</td><td><code>{v.barcode}</code></td>
              <td className="num">{euro(v.price ?? product.price)}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Page>
  );
}
