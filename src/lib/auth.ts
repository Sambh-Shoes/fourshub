import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { one, query } from "./db";
import { can, type Permission, type Role } from "./permissions";

export const SESSION_COOKIE = "fh_session";
const SESSION_DAYS = 14;

export type CurrentUser = {
  id: number;
  name: string;
  username: string;
  role: Role;
  permissions: string[];
  location_id: number | null;
  location_name: string | null;
};

export async function login(username: string, password: string) {
  const user = await one<{ id: number; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE lower(username) = lower($1) AND active",
    [username.trim()],
  );
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return false;

  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [
    token, user.id, expires,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires,
    path: "/",
  });
  return true;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token = $1", [token]);
  jar.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return one<CurrentUser>(
    `SELECT u.id, u.name, u.username, u.role, u.permissions, u.location_id, l.name AS location_name
       FROM sessions s
       JOIN users u ON u.id = s.user_id AND u.active
       LEFT JOIN locations l ON l.id = u.location_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
}

/** For pages and actions: sends people to the login screen if they are not signed in. */
export async function requireUser(perm?: Permission) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (perm && !can(user, perm)) redirect("/?denied=1");
  return user;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}
