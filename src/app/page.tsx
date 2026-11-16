import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { Page } from "@/components/Nav";
import { ClockCard } from "@/components/ClockCard";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const t = await getT();
  const { denied } = await searchParams;

  const totals = await query<{ id: number; name: string; kind: string; pairs: string; models: string }>(
    `SELECT l.id, l.name, l.kind,
            coalesce(sum(s.qty) FILTER (WHERE s.qty > 0), 0) AS pairs,
            count(DISTINCT v.product_id) FILTER (WHERE s.qty > 0) AS models
       FROM locations l
       LEFT JOIN stock s ON s.location_id = l.id
       LEFT JOIN variants v ON v.id = s.variant_id
      WHERE l.active
      GROUP BY l.id ORDER BY l.sort, l.id`,
  );
  const incoming = await query<{ id: number; from_name: string; pairs: string; created_at: Date }>(
    `SELECT t.id, f.name AS from_name, sum(tl.qty) AS pairs, t.created_at
       FROM transfers t JOIN locations f ON f.id = t.from_location
       JOIN transfer_lines tl ON tl.transfer_id = t.id
      WHERE t.status = 'sent' AND ($1::int IS NULL OR t.to_location = $1)
      GROUP BY t.id, f.name ORDER BY t.created_at`,
    [user.location_id],
  );

  return (
    <Page user={user} active="/">
      {denied && <div className="notice">{t("Your account doesn't have access to that page. Ask Maryna if you need it.")}</div>}
      <h1>{t("Hello, {name}", { name: user.name })}</h1>
      <ClockCard user={user} />

      <form action="/products" className="card row">
        <label style={{ flex: 1 }}>
          {t("Find a shoe: scan a barcode or type a name or reference")}
          <input name="q" autoFocus placeholder={t("e.g. 8435… or Botín")} />
        </label>
        <button>{t("Search")}</button>
      </form>

      <h2>{t("Pairs in stock")}</h2>
      <div className="grid-cards">
        {totals.map((x) => (
          <Link key={x.id} href={`/stock?loc=${x.id}`} className="card">
            <div className="muted small">{x.kind === "warehouse" ? t("Warehouse") : t("Shop")}</div>
            <div><b>{x.name}</b></div>
            <div className="stat">{Number(x.pairs).toLocaleString("es-ES")}</div>
            <div className="muted small">{t("{n} models", { n: x.models })}</div>
          </Link>
        ))}
      </div>

      <h2>{user.location_name ? t("Transfers on the way to {place}", { place: user.location_name }) : t("Transfers on the way")}</h2>
      {incoming.length === 0 ? (
        <p className="muted">{t("Nothing on the way.")}</p>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>{t("From")}</th><th className="num">{t("Pairs")}</th><th>{t("Sent")}</th></tr></thead>
          <tbody>
            {incoming.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/transfers/${x.id}`}>#{x.id}</Link></td>
                <td>{x.from_name}</td>
                <td className="num">{x.pairs}</td>
                <td>{x.created_at.toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Page>
  );
}
