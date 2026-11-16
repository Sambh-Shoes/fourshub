import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";
const STATUS = { sent: "On the way", received: "Received", cancelled: "Cancelled" } as const;


export default async function Transfers() {
  const user = await requireUser();
  const t = await getT();
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
        <h1>{t("Transfers")}</h1>
        {can(user, "transfers.create") && <Link className="button" href="/transfers/new">{t("Send shoes")}</Link>}
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>{t("From")}</th><th>{t("To")}</th><th className="num">{t("Pairs")}</th><th>{t("Status")}</th><th>{t("Sent")}</th><th>{t("By")}</th><th>{t("Note")}</th></tr></thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.id}>
              <td><Link href={`/transfers/${x.id}`}>#{x.id}</Link></td>
              <td>{x.from_name}</td><td>{x.to_name}</td><td className="num">{x.pairs}</td>
              <td><span className={`badge ${x.status === "sent" ? "warn" : x.status === "cancelled" ? "off" : ""}`}>{t(STATUS[x.status])}</span></td>
              <td>{x.created_at.toLocaleDateString("es-ES")}</td><td>{x.by}</td><td className="small">{x.note}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">{t("No transfers yet.")}</td></tr>}
        </tbody>
      </table></div>
    </Page>
  );
}
