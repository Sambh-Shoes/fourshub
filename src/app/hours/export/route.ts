import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { TZ } from "@/lib/hours";

// Monthly "registro de jornada": one line per clock-in, in Spanish, for the accountant or an inspection.
export async function GET(req: Request) {
  const user = await getUser();
  if (!can(user, "hours.manage")) return new Response("Not allowed", { status: 403 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });

  const rows = await query<Record<string, string>>(
    `SELECT u.name AS empleado, coalesce(l.name, '') AS centro,
            to_char(e.clock_in AT TIME ZONE '${TZ}', 'DD/MM/YYYY') AS fecha,
            to_char(e.clock_in AT TIME ZONE '${TZ}', 'HH24:MI') AS entrada,
            coalesce(to_char(e.clock_out AT TIME ZONE '${TZ}', 'HH24:MI'), '') AS salida,
            coalesce(replace(to_char(round(extract(epoch FROM e.clock_out - e.clock_in) / 3600, 2), 'FM990.00'), '.', ','), '') AS horas,
            CASE WHEN EXISTS (SELECT 1 FROM time_entry_changes c WHERE c.entry_id = e.id) THEN 'sí' ELSE '' END AS corregido
       FROM time_entries e JOIN users u ON u.id = e.user_id LEFT JOIN locations l ON l.id = e.location_id
      WHERE (e.clock_in AT TIME ZONE '${TZ}')::date >= ($1 || '-01')::date
        AND (e.clock_in AT TIME ZONE '${TZ}')::date < ($1 || '-01')::date + interval '1 month'
      ORDER BY u.name, e.clock_in`,
    [month]);
  const head = ["empleado", "centro", "fecha", "entrada", "salida", "horas", "corregido"];
  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Semicolons and a BOM so Excel in Spain opens it correctly.
  const csv = "﻿" + [head.join(";"), ...rows.map((r) => head.map((h) => esc(r[h] ?? "")).join(";"))].join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registro-jornada-${month}.csv"`,
    },
  });
}
