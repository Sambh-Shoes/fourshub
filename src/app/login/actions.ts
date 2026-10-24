"use server";

import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";

export async function loginAction(_prev: string | null, form: FormData) {
  let ok = false;
  try {
    ok = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  } catch (err) {
    console.error("Login failed", err);
    return "The system can't reach its database right now. Please try again in a minute.";
  }
  if (!ok) return "Wrong username or password.";
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
