import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one, query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { cancelTransfer, receiveTransfer } from "../actions";

export const dynamic = "force-dynamic";
const STATUS = { sent: "On the way", received: "Received", cancelled: "Cancelled" } as const;

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const t = await one<{
    id: number; from_name: string; to_name: string; status: keyof typeof STATUS; note: string | null;
    created_at: Date; by: string | null; received_at: Date | null; received_by: string | null;
  }>(
    `SELECT t.id, f.name AS from_name, d.name AS to_name, t.status, t.note, t.created_at, t.received_at,
            u.name AS by, r.name AS received_by
       FROM transfers t JOIN locations f ON f.id = t.from_location JOIN locations d ON d.id = t.to_location
       LEFT JOIN users u ON u.id = t.created_by LEFT JOIN users r ON r.id = t.received_by
      WHERE t.id = $1`, [id]);
  if (!t) notFound();
  const lines = await query<{ product_id: number; name: string; colour: string | null; size: string | null; barcode: string | null; qty: number }>(
    `SELECT p.id AS product_id, p.name, v.colour, v.size, v.barcode, tl.qty
       FROM transfer_lines tl JOIN variants v ON v.id = tl.variant_id JOIN products p ON p.id = v.product_id
      WHERE tl.transfer_id = $1 ORDER BY p.name, v.colour, v.size`, [id]);

  return (
    <Page user={user} active="/transfers">
      <p className="small"><Link href="/transfers">← All transfers</Link></p>
      <h1>Transfer #{t.id}: {t.from_name} → {t.to_name}</h1>
      <p>
        <span className={`badge ${t.status === "sent" ? "warn" : t.status === "cancelled" ? "off" : ""}`}>{STATUS[t.status]}</span>{" "}
        <span className="muted small">
          Sent {t.created_at.toLocaleString("es-ES")}{t.by ? ` by ${t.by}` : ""}
          {t.received_at ? ` · ${t.status === "received" ? "received" : "cancelled"} ${t.received_at.toLocaleString("es-ES")} by ${t.received_by}` : ""}
        </span>
      </p>
      {t.note && <p>{t.note}</p>}
      <div className="table-wrap"><table>
        <thead><tr><th>Model</th><th>Colour</th><th>Size</th><th>Barcode</th><th className="num">Pairs</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.barcode}>
              <td><Link href={`/products/${l.product_id}`}>{l.name}</Link></td>
              <td>{l.colour}</td><td>{l.size}</td><td><code>{l.barcode}</code></td><td className="num">{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {t.status === "sent" && (
        <p className="row">
          {can(user, "transfers.receive") && (
            <form action={receiveTransfer.bind(null, id)}><button>Mark as received at {t.to_name}</button></form>
          )}
          {can(user, "transfers.create") && (
            <form action={cancelTransfer.bind(null, id)}><button className="secondary">Cancel (put back in {t.from_name})</button></form>
          )}
        </p>
      )}
    </Page>
  );
}
