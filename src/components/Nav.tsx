import Link from "next/link";
import { can } from "@/lib/permissions";
import type { CurrentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

export function Nav({ user, active }: { user: CurrentUser; active: string }) {
  const links = [
    ["/", "Home"],
    ["/products", "Products"],
    ["/stock", "Stock"],
    ["/transfers", "Transfers"],
    ...(can(user, "users.manage") ? [["/users", "Employees"]] : []),
  ];
  return (
    <nav className="top">
      <Link href="/" className="brand">fourshub</Link>
      {links.map(([href, label]) => (
        <Link key={href} href={href} className={active === href ? "on" : ""}>{label}</Link>
      ))}
      <span className="me">
        {user.name}{user.location_name ? ` · ${user.location_name}` : ""}
        <form action={logoutAction}><button>Sign out</button></form>
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
