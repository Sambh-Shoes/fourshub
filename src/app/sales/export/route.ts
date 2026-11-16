import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { TZ } from "@/lib/hours";

// One line per ticket for a month, in Spanish, for the accountant.
export async function GET(req: Request) {
  const user = await getUser();
  if (!can(user, "reports.view")) return new Response("Not allowed", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });

  const num = (col: string) => `replace(to_char(${col}, 'FM9999990.00'), '.', ',')`;
  const rows = await query<Record<string, string>>(
    `SELECT s.number AS ticket, to_char(s.sold_at AT TIME ZONE '${TZ}', 'DD/MM/YYYY') AS fecha,
            to_char(s.sold_at AT TIME ZONE '${TZ}', 'HH24:MI') AS hora, coalesce(l.name, '') AS tienda,
            ${num("s.total")} AS total, ${num("s.tax")} AS iva,
            ${num("coalesce(p.cash, 0)")} AS efectivo, ${num("coalesce(p.card, 0)")} AS tarjeta,
            coalesce(c.name, '') AS cliente, CASE WHEN s.total < 0 THEN 'sí' ELSE '' END AS devolucion
       FROM sales s
       LEFT JOIN locations l ON l.id = s.location_id
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN (SELECT sale_id, sum(amount) FILTER (WHERE method = 'cash') AS cash, sum(amount) FILTER (WHERE method = 'card') AS card
                    FROM sale_payments GROUP BY sale_id) p ON p.sale_id = s.id
      WHERE (s.sold_at AT TIME ZONE '${TZ}')::date >= ($1 || '-01')::date
        AND (s.sold_at AT TIME ZONE '${TZ}')::date < ($1 || '-01')::date + interval '1 month'
      ORDER BY s.sold_at`,
    [month]);
  const head = ["ticket", "fecha", "hora", "tienda", "total", "iva", "efectivo", "tarjeta", "cliente", "devolucion"];
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Semicolons and a BOM so Excel in Spain opens it correctly.
  const csv = "﻿" + [head.join(";"), ...rows.map((r) => head.map((h) => esc(r[h] ?? "")).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-${month}.csv"`,
    },
  });
}
