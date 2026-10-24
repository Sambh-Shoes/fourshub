"use client";

import { useActionState, useState } from "react";
import { saveUser } from "./actions";
import { PERMISSIONS, ROLE_DEFAULTS, ROLE_LABELS, type Role } from "@/lib/permissions";
import type { Location } from "@/lib/data";

type U = { id: number; name: string; username: string; role: Role; permissions: string[]; location_id: number | null; active: boolean };

export function UserForm({ user, locations }: { user: U | null; locations: Location[] }) {
  const [state, action, pending] = useActionState(saveUser.bind(null, user?.id ?? null), null);
  const v = state?.values;
  const k = state ? JSON.stringify(state) : "init";
  const [role, setRole] = useState<Role>(user?.role ?? "shop");
  const [perms, setPerms] = useState<string[]>(user?.permissions ?? ROLE_DEFAULTS.shop);

  function changeRole(r: Role) {
    setRole(r);
    setPerms(ROLE_DEFAULTS[r]);
  }

  return (
    <form action={action} className="card">
      <div className="row">
        <label>Full name<input key={k} name="name" defaultValue={v?.name ?? user?.name} required /></label>
        <label>Username (to sign in)<input key={k} name="username" defaultValue={v?.username ?? user?.username} required autoCapitalize="none" /></label>
        <label>{user ? "New password (leave empty to keep)" : "Password"}<input name="password" type="password" autoComplete="new-password" /></label>
      </div>
      <p />
      <div className="row">
        <label>Role
          <select name="role" value={role} onChange={(e) => changeRole(e.target.value as Role)}>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>Works at
          <select key={k} name="location_id" defaultValue={v?.location_id ?? user?.location_id ?? ""}>
            <option value="">All places</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="check"><input key={k} type="checkbox" name="active" defaultChecked={v ? v.active === "on" : user?.active ?? true} /> Can sign in</label>
      </div>

      <h2>What this person can do</h2>
      <p className="muted small">Everyone can look up products and stock. Changing the role resets the ticks to that role&apos;s usual set.</p>
      {role === "admin" ? (
        <p>The owner/admin can do everything.</p>
      ) : (
        Object.entries(PERMISSIONS).map(([k, label]) => (
          <label key={k} className="check">
            <input type="checkbox" name={`perm:${k}`} checked={perms.includes(k)}
              onChange={(e) => setPerms(e.target.checked ? [...perms, k] : perms.filter((p) => p !== k))} />
            {label}
          </label>
        ))
      )}
      {role === "admin" && Object.keys(PERMISSIONS).map((k) => <input key={k} type="hidden" name={`perm:${k}`} value="on" />)}
      {state?.error && <p className="error">{state.error}</p>}
      <p><button disabled={pending}>Save</button></p>
    </form>
  );
}
