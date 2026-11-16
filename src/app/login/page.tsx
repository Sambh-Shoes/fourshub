"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(loginAction, null);
  return (
    <div className="login card">
      <img className="logo" src="/logo.png" alt="Fours Barcelona" />
      <p className="muted small" style={{ textAlign: "center", marginTop: 0 }}>Sign in with your own account</p>
      <form action={action}>
        <label>Username<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="error small">{error}</p>}
        <button disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
