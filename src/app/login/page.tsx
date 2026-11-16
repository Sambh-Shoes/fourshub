"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { useT } from "@/components/LangProvider";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/components/LangProvider";

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null);
  const t = useT();
  const lang = useLang();
  return (
    <div className="login card">
      <img className="logo" src="/logo.png" alt="Fours Barcelona" />
      <p className="muted small" style={{ textAlign: "center", marginTop: 0 }}>{t("Sign in with your own account")}</p>
      <form action={action}>
        <label>{t("Username")}<input name="username" autoComplete="username" required autoFocus /></label>
        <label>{t("Password")}<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error small">{error}</p>}
        <button disabled={pending}>{pending ? t("Signing in…") : t("Sign in")}</button>
      </form>
      <p style={{ textAlign: "center" }}><LangSwitch current={lang} /></p>
    </div>
  );
}
