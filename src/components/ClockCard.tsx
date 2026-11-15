import { one } from "@/lib/db";
import { clock, hm, TZ } from "@/lib/hours";
import { clockIn, clockOut } from "@/app/hours/actions";
import type { CurrentUser } from "@/lib/auth";

/** Big clock in / clock out button for the person signed in. */
export async function ClockCard({ user }: { user: CurrentUser }) {
  const s = await one<{ open_since: Date | null; today: string }>(
    `SELECT (SELECT clock_in FROM time_entries WHERE user_id = $1 AND clock_out IS NULL) AS open_since,
            coalesce(sum(extract(epoch FROM coalesce(clock_out, now()) - clock_in) / 60), 0) AS today
       FROM time_entries
      WHERE user_id = $1 AND (clock_in AT TIME ZONE '${TZ}')::date = (now() AT TIME ZONE '${TZ}')::date`,
    [user.id]);
  const open = s?.open_since ?? null;
  return (
    <div className="card row" style={{ alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <b>{open ? `Working since ${clock(open)}` : "Not clocked in"}</b>
        <div className="muted small">Today: {hm(s?.today ?? 0)}</div>
      </div>
      {open ? (
        <form action={clockOut}><button className="secondary">Clock out</button></form>
      ) : (
        <form action={clockIn}><button>Clock in</button></form>
      )}
    </div>
  );
}
