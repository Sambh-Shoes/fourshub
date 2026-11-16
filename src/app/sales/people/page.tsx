import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { thisMonth, TZ } from "@/lib/hours";
import { euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

const LOCAL = `(s.sold_at AT TIME ZONE '${TZ}')`;

export default async function SalesByPerson({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser("reports.view");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const rawLabel = new Date(`${month}-15`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  const shift = (n: number) => { const d = new Date(`${month}-15`); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };

  // A person is the till user (till sales) or the cashier name Odoo recorded (history).
  const rows = await query<{
    person: string; tickets: string; returns: string; pairs: string; total: string; shop: string | null; hours: string | null;
  }>(
    `WITH month_sales AS (
       SELECT s.id, s.total, s.location_id, coalesce(u.sales_name, u.name, s.cashier, 'Unknown') AS person
         FROM sales s LEFT JOIN users u ON u.id = s.user_id
        WHERE ${LOCAL}::date >= ($1 || '-01')::date AND ${LOCAL}::date < ($1 || '-01')::date + interval '1 month'),
     pairs AS (
       SELECT l.sale_id, sum(l.qty) AS qty FROM sale_lines l WHERE l.sku IS NOT NULL OR l.variant_id IS NOT NULL GROUP BY l.sale_id),
     hours AS (
       SELECT coalesce(u.sales_name, u.name) AS person,
              sum(extract(epoch FROM coalesce(e.clock_out, now()) - e.clock_in)) / 3600 AS h
         FROM time_entries e JOIN users u ON u.id = e.user_id
        WHERE (e.clock_in AT TIME ZONE '${TZ}')::date >= ($1 || '-01')::date
          AND (e.clock_in AT TIME ZONE '${TZ}')::date < ($1 || '-01')::date + interval '1 month'
        GROUP BY 1)
     SELECT m.person, count(*) AS tickets, count(*) FILTER (WHERE m.total < 0) AS returns,
            coalesce(sum(p.qty), 0) AS pairs, sum(m.total) AS total,
            (SELECT l.name FROM month_sales m2 JOIN locations l ON l.id = m2.location_id WHERE m2.person = m.person
              GROUP BY l.name ORDER BY count(*) DESC LIMIT 1) AS shop,
            (SELECT h.h FROM hours h WHERE h.person = m.person) AS hours
       FROM month_sales m LEFT JOIN pairs p ON p.sale_id = m.id
      GROUP BY m.person ORDER BY sum(m.total) DESC`,
    [month]);
  const totalAll = rows.reduce((n, r) => n + Number(r.total), 0);
  const hrs = (v: string | null) => (v === null ? "–" : `${Number(v).toLocaleString("es-ES", { maximumFractionDigits: 1 })} h`);

  return (
    <Page user={user} active="/sales">
      <h1>Sales by person</h1>
      <p className="row">
        <Link className="btn" href={`/sales/people?month=${shift(-1)}`}>←</Link>
        <strong>{monthLabel}</strong>
        <Link className="btn" href={`/sales/people?month=${shift(1)}`}>→</Link>
        <Link className="btn" href={`/sales?month=${month}`}>Sales by shop</Link>
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th>Person</th><th>Mostly at</th><th className="num">Tickets</th><th className="num">Pairs</th><th className="num">Sold (VAT incl.)</th><th className="num">Average ticket</th><th className="num">Share</th><th className="num">Hours</th><th className="num">Sold per hour</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.person}>
              <td>{r.person}</td><td className="small">{r.shop ?? "–"}</td>
              <td className="num">{r.tickets}{Number(r.returns) > 0 && <span className="muted small"> ({r.returns} ret.)</span>}</td>
              <td className="num">{Number(r.pairs).toLocaleString("es-ES")}</td>
              <td className="num">{euro(r.total)}</td>
              <td className="num">{euro(Number(r.total) / Math.max(1, Number(r.tickets)))}</td>
              <td className="num">{totalAll > 0 ? `${Math.round((Number(r.total) / totalAll) * 100)}%` : "–"}</td>
              <td className="num">{hrs(r.hours)}</td>
              <td className="num">{r.hours && Number(r.hours) > 0 ? euro(Number(r.total) / Number(r.hours)) : "–"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="muted">No sales this month.</td></tr>}
        </tbody>
      </table></div>
      <p className="muted small">
        Past sales carry the cashier name Odoo recorded. Hours come from fourshub&apos;s own clock in / clock out, so they appear once people
        start using it (Odoo kept no working hours). Sold per hour needs both.
      </p>
    </Page>
  );
}
