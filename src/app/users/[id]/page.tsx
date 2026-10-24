import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { one } from "@/lib/db";
import { getLocations } from "@/lib/data";
import type { Role } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { UserForm } from "../UserForm";

export const dynamic = "force-dynamic";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser("users.manage");
  const { id } = await params;
  const locations = await getLocations();
  const user = id === "new" ? null : await one<{
    id: number; name: string; username: string; role: Role; permissions: string[]; location_id: number | null; active: boolean; weekly_hours: string | null;
  }>("SELECT id, name, username, role, permissions, location_id, active, weekly_hours FROM users WHERE id = $1", [Number(id) || 0]);
  if (id !== "new" && !user) notFound();
  return (
    <Page user={me} active="/users">
      <p className="small"><Link href="/users">← All employees</Link></p>
      <h1>{user ? user.name : "Add employee"}</h1>
      <UserForm user={user} locations={locations} />
    </Page>
  );
}
