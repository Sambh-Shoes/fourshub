import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { can } from "@/lib/permissions";
import { clock, hm, thisMonth, TZ } from "@/lib/hours";
import { Page } from "@/components/Nav";
import { ClockCard } from "@/components/ClockCard";
import { EntryForm } from "./EntryForm";

export const dynamic = "force-dynamic";

const MONTH = `(($1 || '-01')::date)`;
const IN_MONTH = `(e.clock_in AT TIME ZONE '${TZ}')::date >= ${MONTH} AND (e.clock_in AT TIME ZONE '${TZ}')::date < ${MONTH} + interval '1 month'`;
const MINUTES = `extract(epoch FROM coalesce(e.clock_out, now()) - e.clock_in) / 60`;

export default async function Hours({ searchParams }: { searchParams: Promise<{ month?: string; user?: string }> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : thisMonth();
  const manager = can(me, "hours.manage");
  const userId = manager ? Number(sp.user) || null : me.id;
  const rawLabel = new Date(`${month}-15`).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const monthLabel = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
  const shift = (n: number) => {
    const d = new Date(`${month}-15`); d.setMonth(d.getMonth() + n);
    return d.toISOString().slice(0, 7);
  };
  const link = (m: string, u: number | null = userId) => `/hours?month=${m}${u ? `&user=${u}` : ""}`;

  return (
    <Page user={me} active="/hours">
      <h1>Working hours</h1>
      <ClockCard user={me} />
      <div className="row" style={{ alignItems: "center" }}>
        <Link className="button secondary" href={link(shift(-1))}>←</Link>
        <b>{monthLabel}</b>
        <Link className="button secondary" href={link(shift(1))}>→</Link>
        {manager && <a className="button secondary" href={`/hours/export?month=${month}`}>Download for the accountant (CSV)</a>}
      </div>
      {manager && !userId ? <Summary month={month} link={link} /> : <Detail month={month} userId={userId ?? me.id} manager={manager} back={manager ? link(month, null) : null} />}
    </Page>
  );
}

async function Summary({ month, link }: { month: string; link: (m: string, u?: number | null) => string }) {
  const rows = await query<{ id: number; name: string; location: string | null; weekly_hours: string | null; minutes: string; days: string; open: boolean }>(
    `SELECT u.id, u.name, l.name AS location, u.weekly_hours,
            coalesce(sum(${MINUTES}) FILTER (WHERE ${IN_MONTH}), 0) AS minutes,
            count(DISTINCT (e.clock_in AT TIME ZONE '${TZ}')::date) FILTER (WHERE ${IN_MONTH}) AS days,
            bool_or(e.clock_out IS NULL) AS open
       FROM users u LEFT JOIN locations l ON l.id = u.location_id LEFT JOIN time_entries e ON e.user_id = u.id
      WHERE u.active GROUP BY u.id, l.name ORDER BY u.name`,
    [month]);
  return (
    <>
      <h2>Everyone this month</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Employee</th><th>Works at</th><th className="num">Days worked</th><th className="num">Hours</th><th className="num">Contract (h/week)</th><th>Now</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={link(month, r.id)}>{r.name}</Link></td>
              <td>{r.location ?? "All places"}</td>
              <td className="num">{r.days}</td>
              <td className="num"><b>{hm(r.minutes)}</b></td>
              <td className="num">{r.weekly_hours ?? ""}</td>
              <td>{r.open && <span className="badge">working</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

async function Detail({ month, userId, manager, back }: { month: string; userId: number; manager: boolean; back: string | null }) {
  const [person] = await query<{ name: string }>("SELECT name FROM users WHERE id = $1", [userId]);
  const entries = await query<{
    id: number; day: string; clock_in: Date; clock_out: Date | null; minutes: string; location: string | null;
    in_local: string; out_local: string | null; changes: string;
  }>(
    `SELECT e.id, to_char(e.clock_in AT TIME ZONE '${TZ}', 'Dy DD/MM') AS day, e.clock_in, e.clock_out, ${MINUTES} AS minutes,
            l.name AS location,
            to_char(e.clock_in AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI') AS in_local,
            to_char(e.clock_out AT TIME ZONE '${TZ}', 'YYYY-MM-DD"T"HH24:MI') AS out_local,
            (SELECT count(*) FROM time_entry_changes c WHERE c.entry_id = e.id) AS changes
       FROM time_entries e LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.user_id = $2 AND ${IN_MONTH} ORDER BY e.clock_in`,
    [month, userId]);
  const changes = await query<{ changed_at: Date; by: string; reason: string; old_in: Date | null; old_out: Date | null; new_in: Date; new_out: Date | null }>(
    `SELECT c.changed_at, u.name AS by, c.reason, c.old_in, c.old_out, c.new_in, c.new_out
       FROM time_entry_changes c JOIN time_entries e ON e.id = c.entry_id JOIN users u ON u.id = c.changed_by
      WHERE e.user_id = $2 AND ${IN_MONTH} ORDER BY c.changed_at`,
    [month, userId]);
  const total = entries.reduce((n, e) => n + Number(e.minutes), 0);
  const fmt = (d: Date | null) => (d ? d.toLocaleString("es-ES", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : "–");

  return (
    <>
      <h2>{back && <><Link href={back}>Everyone</Link> / </>}{person?.name}: {hm(total)} this month</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Day</th><th>In</th><th>Out</th><th className="num">Time</th><th>Where</th>{manager && <th>Correct</th>}</tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td style={{ textTransform: "capitalize" }}>{e.day}</td>
              <td>{clock(e.clock_in)}</td>
              <td>{e.clock_out ? clock(e.clock_out) : <span className="badge">working</span>}</td>
              <td className="num">{hm(e.minutes)}</td>
              <td className="small">{e.location}{Number(e.changes) > 0 && <> <span className="badge warn">corrected</span></>}</td>
              {manager && <td><EntryForm entryId={e.id} userId={userId} clockIn={e.in_local} clockOut={e.out_local ?? undefined} /></td>}
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={6} className="muted">No hours this month.</td></tr>}
        </tbody>
      </table></div>
      {manager && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Add a missing entry</h2>
          <EntryForm entryId={null} userId={userId} />
        </div>
      )}
      {changes.length > 0 && (
        <>
          <h2>Corrections</h2>
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>By</th><th>Before</th><th>After</th><th>Reason</th></tr></thead>
            <tbody>
              {changes.map((c, i) => (
                <tr key={i}>
                  <td className="small">{fmt(c.changed_at)}</td><td>{c.by}</td>
                  <td className="small">{c.old_in ? `${fmt(c.old_in)} → ${fmt(c.old_out)}` : "(added)"}</td>
                  <td className="small">{fmt(c.new_in)} → {fmt(c.new_out)}</td><td>{c.reason}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}
