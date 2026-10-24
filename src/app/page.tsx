import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
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
      {denied && <div className="notice">Your account doesn&apos;t have access to that page. Ask Maryna if you need it.</div>}
      <h1>Hello, {user.name}</h1>

      <form action="/products" className="card row">
        <label style={{ flex: 1 }}>
          Find a shoe: scan a barcode or type a name or reference
          <input name="q" autoFocus placeholder="e.g. 8435… or Botín" />
        </label>
        <button>Search</button>
      </form>

      <h2>Pairs in stock</h2>
      <div className="grid-cards">
        {totals.map((t) => (
          <Link key={t.id} href={`/stock?loc=${t.id}`} className="card">
            <div className="muted small">{t.kind === "warehouse" ? "Warehouse" : "Shop"}</div>
            <div><b>{t.name}</b></div>
            <div className="stat">{Number(t.pairs).toLocaleString("es-ES")}</div>
            <div className="muted small">{t.models} models</div>
          </Link>
        ))}
      </div>

      <h2>Transfers on the way{user.location_name ? ` to ${user.location_name}` : ""}</h2>
      {incoming.length === 0 ? (
        <p className="muted">Nothing on the way.</p>
      ) : (
        <div className="table-wrap"><table>
          <thead><tr><th>#</th><th>From</th><th className="num">Pairs</th><th>Sent</th></tr></thead>
          <tbody>
            {incoming.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/transfers/${t.id}`}>#{t.id}</Link></td>
                <td>{t.from_name}</td>
                <td className="num">{t.pairs}</td>
                <td>{t.created_at.toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Page>
  );
}
