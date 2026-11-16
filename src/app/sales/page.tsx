import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { thisMonth, TZ } from "@/lib/hours";
import { euro } from "@/lib/sizes";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

// A sale's local date in Spain, compared with the month asked for.
const LOCAL = `(s.sold_at AT TIME ZONE '${TZ}')`;
const IN_MONTH = `${LOCAL}::date >= ($1 || '-01')::date AND ${LOCAL}::date < ($1 || '-01')::date + interval '1 month'`;
const PAID = `(SELECT sale_id, sum(amount) FILTER (WHERE method = 'cash') AS cash, sum(amount) FILTER (WHERE method = 'card') AS card
                 FROM sale_payments GROUP BY sale_id)`;

export default async function Sales({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser("reports.view");
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const rawLabel = new Date(`${month}-15`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  const shift = (n: number) => {
    const d = new Date(`${month}-15`); d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 7);
  };

  const rows = await query<{ shop: string; tickets: string; total: string; tax: string; cash: string; card: string; refunds: string }>(
    `SELECT coalesce(l.name, 'Unknown') AS shop, count(*) AS tickets, sum(s.total) AS total, sum(s.tax) AS tax,
            coalesce(sum(p.cash), 0) AS cash, coalesce(sum(p.card), 0) AS card,
            count(*) FILTER (WHERE s.total < 0) AS refunds
       FROM sales s LEFT JOIN locations l ON l.id = s.location_id LEFT JOIN ${PAID} p ON p.sale_id = s.id
      WHERE ${IN_MONTH}
      GROUP BY l.name, l.sort ORDER BY l.sort NULLS LAST`,
    [month]);
  const sum = (k: "tickets" | "total" | "tax" | "cash" | "card" | "refunds") => rows.reduce((n, r) => n + Number(r[k]), 0);

  const months = await query<{ m: string; total: string }>(
    `SELECT to_char(${LOCAL}, 'YYYY-MM') AS m, sum(s.total) AS total FROM sales s GROUP BY 1 ORDER BY 1 DESC LIMIT 24`);

  return (
    <Page user={user} active="/sales">
      <h1>Sales</h1>
      <p className="row">
        <Link className="btn" href={`/sales?month=${shift(-1)}`}>←</Link>
        <strong>{monthLabel}</strong>
        <Link className="btn" href={`/sales?month=${shift(1)}`}>→</Link>
        <a className="btn" href={`/sales/export?month=${month}`}>Download for the accountant (CSV)</a>
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th>Shop</th><th className="num">Tickets</th><th className="num">Returns</th><th className="num">Total (VAT incl.)</th><th className="num">VAT</th><th className="num">Cash</th><th className="num">Card</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.shop}><td>{r.shop}</td><td className="num">{r.tickets}</td><td className="num">{r.refunds}</td><td className="num">{euro(r.total)}</td><td className="num">{euro(r.tax)}</td><td className="num">{euro(r.cash)}</td><td className="num">{euro(r.card)}</td></tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={7} className="muted">No sales this month.</td></tr>}
          {rows.length > 1 && (
            <tr><td><strong>All shops</strong></td><td className="num">{sum("tickets")}</td><td className="num">{sum("refunds")}</td><td className="num"><strong>{euro(sum("total"))}</strong></td><td className="num">{euro(sum("tax"))}</td><td className="num">{euro(sum("cash"))}</td><td className="num">{euro(sum("card"))}</td></tr>
          )}
        </tbody>
      </table></div>
      <p className="muted small">Sales loaded from Odoo, until the day the shops start selling in fourshub. Cash is after change given back.</p>

      <h2>By month</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Month</th><th className="num">Total (VAT incl.)</th></tr></thead>
        <tbody>{months.map((m) => <tr key={m.m}><td><Link href={`/sales?month=${m.m}`}>{m.m}</Link></td><td className="num">{euro(m.total)}</td></tr>)}</tbody>
      </table></div>
    </Page>
  );
}
