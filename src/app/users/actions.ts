"use server";

import { redirect } from "next/navigation";
import { requireUser, hashPassword } from "@/lib/auth";
import { query } from "@/lib/db";
import { PERMISSIONS, ROLE_LABELS, type Role } from "@/lib/permissions";

export async function saveUser(id: number | null, _prev: string | null, form: FormData) {
  const me = await requireUser("users.manage");
  const name = String(form.get("name") ?? "").trim();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const role = String(form.get("role")) as Role;
  const locationId = Number(form.get("location_id")) || null;
  const active = form.get("active") === "on";
  const permissions = Object.keys(PERMISSIONS).filter((p) => form.get(`perm:${p}`) === "on");

  if (!name || !/^[a-z0-9._-]{2,}$/.test(username)) return "Name and username are needed (username: letters and numbers, no spaces).";
  if (!(role in ROLE_LABELS)) return "Choose a role.";
  if (password && password.length < 6) return "Password must be at least 6 characters.";
  if (!id && !password) return "Give the new person a password.";
  if (id === me.id && (!active || role !== "admin") && me.role === "admin") return "You can't remove your own admin access.";

  const taken = await query("SELECT 1 FROM users WHERE username = $1 AND id <> coalesce($2, 0)", [username, id]);
  if (taken.length) return "That username is already used.";

  if (id) {
    await query(
      `UPDATE users SET name = $2, username = $3, role = $4, location_id = $5, active = $6, permissions = $7 WHERE id = $1`,
      [id, name, username, role, locationId, active, permissions]);
    if (password) {
      await query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, await hashPassword(password)]);
      await query("DELETE FROM sessions WHERE user_id = $1", [id]);
    }
    if (!active) await query("DELETE FROM sessions WHERE user_id = $1", [id]);
  } else {
    await query(
      `INSERT INTO users (name, username, password_hash, role, location_id, active, permissions) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [name, username, await hashPassword(password), role, locationId, active, permissions]);
  }
  redirect("/users");
}
