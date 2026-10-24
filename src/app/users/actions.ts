"use server";

import { redirect } from "next/navigation";
import { requireUser, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { PERMISSIONS, ROLE_LABELS, type Role } from "@/lib/permissions";

export type UserFormState = { error: string; values: Record<string, string> } | null;

export async function saveUser(id: number | null, _prev: UserFormState, form: FormData): Promise<UserFormState> {
  const me = await requireUser("users.manage");
  const values = Object.fromEntries(["name", "username", "location_id", "active", "weekly_hours"].map((k) => [k, String(form.get(k) ?? "")]));
  const fail = (error: string) => ({ error, values });
  const name = String(form.get("name") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role")) as Role;
  const locationId = Number(form.get("location_id")) || null;
  const active = form.get("active") === "on";
  const weeklyHours = String(form.get("weekly_hours") ?? "").replace(",", ".").trim();
  const permissions = Object.keys(PERMISSIONS).filter((p) => form.get(`perm:${p}`) === "on");

  if (!name || !/^[a-z0-9._-]{2,}$/.test(username)) return fail("Name and username are needed (username: letters and numbers, no spaces).");
  if (!(role in ROLE_LABELS)) return fail("Choose a role.");
  if (weeklyHours && (isNaN(Number(weeklyHours)) || Number(weeklyHours) > 80)) return fail("Weekly hours should be a number like 40 or 20.");
  if (password && password.length < 6) return fail("Password must be at least 6 characters.");
  if (!id && !password) return fail("Give the new person a password.");
  if (id === me.id && (!active || role !== "admin") && me.role === "admin") return fail("You can't remove your own admin access.");

  const taken = await query("SELECT 1 FROM users WHERE username = $1 AND id <> coalesce($2, 0)", [username, id]);
  if (taken.length) return fail("That username is already used.");

  if (id) {
    await query(
      `UPDATE users SET name = $2, username = $3, role = $4, location_id = $5, active = $6, permissions = $7,
              weekly_hours = nullif($8, '')::numeric WHERE id = $1`,
      [id, name, username, role, locationId, active, permissions, weeklyHours]);
    if (password) {
      await query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, await hashPassword(password)]);
      await query("DELETE FROM sessions WHERE user_id = $1", [id]);
    }
    if (!active) await query("DELETE FROM sessions WHERE user_id = $1", [id]);
  } else {
    await query(
      `INSERT INTO users (name, username, password_hash, role, location_id, active, permissions, weekly_hours)
       VALUES ($1, $2, $3, $4, $5, $6, $7, nullif($8, '')::numeric)`,
      [name, username, await hashPassword(password), role, locationId, active, permissions, weeklyHours]);
  }
  redirect("/users");
}
