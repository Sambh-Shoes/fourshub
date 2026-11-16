import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { StaffFromSales, type Suggestion } from "./StaffFromSales";

export const dynamic = "force-dynamic";

export default async function Users() {
  const user = await requireUser("users.manage");
  const users = await query<{ id: number; name: string; username: string; role: Role; location: string | null; active: boolean }>(
    `SELECT u.id, u.name, u.username, u.role, l.name AS location, u.active
       FROM users u LEFT JOIN locations l ON l.id = u.location_id ORDER BY u.active DESC, u.name`);
  const people = (await query<{ name: string; tickets: string; last: string; shop: string | null; recent: boolean }>(
    `SELECT s.cashier AS name, count(*) AS tickets, to_char(max(s.sold_at AT TIME ZONE 'Europe/Madrid'), 'DD/MM/YYYY') AS last,
            (SELECT l.name FROM sales s2 JOIN locations l ON l.id = s2.location_id
              WHERE s2.cashier = s.cashier AND s2.sold_at > now() - interval '180 days' GROUP BY l.name ORDER BY count(*) DESC LIMIT 1) AS shop,
            max(s.sold_at) > now() - interval '45 days' AS recent
       FROM sales s
      WHERE s.cashier IS NOT NULL AND s.sold_at > now() - interval '180 days' AND s.cashier <> 'Administrator'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.name) = lower(s.cashier) OR lower(u.sales_name) = lower(s.cashier))
      GROUP BY s.cashier ORDER BY max(s.sold_at) DESC`)
  ).map((r): Suggestion => ({ name: r.name, tickets: Number(r.tickets), last: r.last, shop: r.shop, recent: r.recent }));
  return (
    <Page user={user} active="/users">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>Employees</h1>
        <span className="row">
          {user.role === "admin" && <Link className="button secondary" href="/import">Load products from Odoo</Link>}
          <Link className="button" href="/users/new">Add employee</Link>
        </span>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Works at</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/users/${u.id}`}>{u.name}</Link></td>
              <td>{u.username}</td><td>{ROLE_LABELS[u.role]}</td><td>{u.location ?? "All places"}</td>
              <td>{!u.active && <span className="badge off">can&apos;t sign in</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {people.length > 0 && <StaffFromSales people={people} />}
    </Page>
  );
}
