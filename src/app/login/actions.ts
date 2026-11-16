"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout } from "@/lib/auth";
import { describeDbError, one } from "@/lib/db";
import { LANG_COOKIE, asLang, makeT } from "@/lib/i18n";
import { getLang } from "@/lib/lang";

export async function loginAction(_prev: string | null, form: FormData) {
  const t = makeT(await getLang());
  let ok = false;
  try {
    ok = await login(String(form.get("username") ?? ""), String(form.get("password") ?? ""));
  } catch (err) {
    console.error("Login failed", err);
    return t("The system can't reach its database right now. (Details: {details})", { details: describeDbError(err) });
  }
  if (!ok) return t("Wrong username or password.");
  // The language saved on the account comes with the person to any computer they sign in on.
  const saved = await one<{ language: string }>("SELECT language FROM users WHERE lower(username) = lower($1)", [String(form.get("username") ?? "").trim()]);
  if (saved) (await cookies()).set(LANG_COOKIE, asLang(saved.language), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect("/");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
