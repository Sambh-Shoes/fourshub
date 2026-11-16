import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function Customers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser("reports.view");
  const q = ((await searchParams).q ?? "").trim();
  const rows = await query<{
    id: number; name: string; email: string | null; phone: string | null; city: string | null;
    points: string; tickets: string; spent: string; last: string | null;
  }>(
    `SELECT c.id, c.name, c.email, c.phone, c.city, c.points,
            count(s.id) AS tickets, coalesce(sum(s.total), 0) AS spent,
            to_char(max(s.sold_at) AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY') AS last
       FROM customers c LEFT JOIN sales s ON s.customer_id = c.id
      WHERE c.active AND ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR c.email ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%')
      GROUP BY c.id ORDER BY c.name LIMIT 500`,
    [q]);
  return (
    <Page user={user} active="/customers">
      <h1>Customers</h1>
      <form className="card row">
        <label style={{ flex: 1 }}>Name, email or phone<input name="q" defaultValue={q} /></label>
        <button>Search</button>
      </form>
      <p className="muted">{rows.length} customers{rows.length === 500 ? " (first 500 shown, search to narrow)" : ""}. Walk-in sales have no customer.</p>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th className="num">Points</th><th className="num">Tickets</th><th className="num">Spent</th><th>Last sale</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td><td className="small">{r.email}</td><td className="small">{r.phone}</td><td className="small">{r.city}</td>
              <td className="num">{Number(r.points).toLocaleString("es-ES")}</td><td className="num">{r.tickets}</td>
              <td className="num">{euro(r.spent)}</td><td className="small">{r.last}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No customers found.</td></tr>}
        </tbody>
      </table></div>
    </Page>
  );
}
