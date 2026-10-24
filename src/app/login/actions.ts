"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

export async function loginAction(_prev: string | null, form: FormData) {
  const ok = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  if (!ok) return "Wrong username or password.";
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
