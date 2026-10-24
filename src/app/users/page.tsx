import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { Page } from "@/components/Nav";

export const dynamic = "force-dynamic";

export default async function Users() {
  const user = await requireUser("users.manage");
  const users = await query<{ id: number; name: string; username: string; role: Role; location: string | null; active: boolean }>(
    `SELECT u.id, u.name, u.username, u.role, l.name AS location, u.active
       FROM users u LEFT JOIN locations l ON l.id = u.location_id ORDER BY u.active DESC, u.name`);
  return (
    <Page user={user} active="/users">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>Employees</h1>
        <Link className="button" href="/users/new">Add employee</Link>
      </div>
      <div className="table-wrap"><table>
        <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Works at</th><th></th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/users/${u.id}`}>{u.name}</Link></td>
              <td>{u.username}</td><td>{ROLE_LABELS[u.role]}</td><td>{u.location ?? "All places"}</td>
              <td>{!u.active && <span className="badge off">can&apos;t sign in</span>}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </Page>
  );
}
