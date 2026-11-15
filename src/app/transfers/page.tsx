import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";
const STATUS = { sent: "On the way", received: "Received", cancelled: "Cancelled" } as const;


export default async function Transfers() {
  const user = await requireUser();
  const rows = await query<{
    id: number; from_name: string; to_name: string; status: keyof typeof STATUS; pairs: string;
    created_at: Date; by: string | null; note: string | null;
  }>(
    `SELECT t.id, f.name AS from_name, d.name AS to_name, t.status, t.created_at, t.note, u.name AS by,
            (SELECT sum(qty) FROM transfer_lines WHERE transfer_id = t.id) AS pairs
       FROM transfers t JOIN locations f ON f.id = t.from_location JOIN locations d ON d.id = t.to_location
       LEFT JOIN users u ON u.id = t.created_by
      ORDER BY (t.status = 'sent') DESC, t.created_at DESC LIMIT 200`,
  );
  return (
    <Page user={user} active="/transfers">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>Transfers</h1>
        {can(user, "transfers.create") && <Link className="button" href="/transfers/new">Send shoes</Link>}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>From</th><th>To</th><th className="num">Pairs</th><th>Status</th><th>Sent</th><th>By</th><th>Note</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td><Link href={`/transfers/${t.id}`}>#{t.id}</Link></td>
              <td>{t.from_name}</td><td>{t.to_name}</td><td className="num">{t.pairs}</td>
              <td><span className={`badge ${t.status === "sent" ? "warn" : t.status === "cancelled" ? "off" : ""}`}>{STATUS[t.status]}</span></td>
              <td>{t.created_at.toLocaleDateString("es-ES")}</td><td>{t.by}</td><td className="small">{t.note}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No transfers yet.</td></tr>}
        </tbody>
      </table></div>
    </Page>
  );
}
