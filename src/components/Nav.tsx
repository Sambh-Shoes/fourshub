import Link from "next/link";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { getLang } from "@/lib/lang";
import { makeT } from "@/lib/i18n";
import { LangSwitch } from "./LangSwitch";

export async function Nav({ user, active }: { user: CurrentUser; active: string }) {
  const lang = await getLang();
  const t = makeT(lang);
  const links = [
    ["/", t("Home")],
    ...(can(user, "till.use") ? [["/till", t("Till")]] : []),
    ["/products", t("Products")],
    ["/stock", t("Stock")],
    ["/transfers", t("Transfers")],
    ["/hours", t("Hours")],
    ...(can(user, "reports.view") ? [["/sales", t("Sales")], ["/customers", t("Customers")]] : []),
    ...(can(user, "users.manage") ? [["/users", t("Employees")]] : []),
    ...(user.role === "admin" ? [["/shopify", "Shopify"]] : []),
  ];
  return (
    <nav className="top">
      <Link href="/" className="brand" aria-label="Fours Barcelona"><img src="/logo.png" alt="Fours Barcelona" /></Link>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={active === href ? "on" : ""}>{label}</Link>
      ))}
      <span className="me">
        {user.name}{user.location_name ? ` · ${user.location_name}` : ""}
        <LangSwitch current={lang} />
        <form action={logoutAction}><button>{t("Sign out")}</button></form>
      </span>
    </nav>
  );
}

export async function Page({ user, active, children }: { user: CurrentUser; active: string; children: React.ReactNode }) {
  return (
    <>
      <Nav user={user} active={active} />
      <main>{children}</main>
    </>
  );
}
