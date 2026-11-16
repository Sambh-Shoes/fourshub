"use client";

import { useActionState } from "react";
import { addStaffFromSales } from "./staffActions";

export type Suggestion = { name: string; tickets: number; last: string; shop: string | null; recent: boolean };

export function StaffFromSales({ people }: { people: Suggestion[] }) {
  const [state, action, pending] = useActionState(addStaffFromSales, null);
  return (
    <form action={action} className="card">
      <h2>People from Odoo&apos;s sales history</h2>
      <p className="muted small">
        These names appear as cashier on past tickets and are not employees here yet. Tick the ones who work for you now. They are added
        <b> without a login</b>; you then give each a password. Their past sales and, later, their hours line up under the same name.
      </p>
      <div className="table-wrap"><table>
        <thead><tr><th></th><th>Name</th><th className="num">Tickets (last 6 months)</th><th>Last sale</th><th>Mostly at</th></tr></thead>
        <tbody>{people.map((p) => (
          <tr key={p.name}>
            <td><input type="checkbox" name="name" value={p.name} defaultChecked={p.recent} /></td>
            <td>{p.name}</td><td className="num">{p.tickets}</td><td className="small">{p.last}</td><td className="small">{p.shop ?? "–"}</td>
          </tr>))}</tbody>
      </table></div>
      <p className="muted small">Ticked by default: people with a sale in the last 45 days.</p>
      <p><button disabled={pending}>{pending ? "Adding…" : "Add the ticked people"}</button></p>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.summary && <div className="notice">{state.summary}</div>}
    </form>
  );
}
