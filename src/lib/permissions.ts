// What each person can do. Every role starts with a set of permissions,
// and an admin can tick extra ones on or off per person.

export const PERMISSIONS = {
  "products.edit": "Edit products (names, sizes, colours)",
  "prices.edit": "Change prices",
  "stock.adjust": "Correct stock counts and boxes",
  "transfers.create": "Send stock to another shop",
  "transfers.receive": "Receive stock from another shop",
  "users.manage": "Manage employees and their access",
} as const;

export type Permission = keyof typeof PERMISSIONS;
export type Role = "admin" | "manager" | "shop" | "warehouse";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Owner / admin",
  manager: "Manager",
  shop: "Shop staff",
  warehouse: "Warehouse staff",
};

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  admin: Object.keys(PERMISSIONS) as Permission[],
  manager: ["products.edit", "prices.edit", "stock.adjust", "transfers.create", "transfers.receive"],
  shop: ["transfers.create", "transfers.receive"],
  warehouse: ["products.edit", "stock.adjust", "transfers.create", "transfers.receive"],
};

export function can(user: { role: Role; permissions: string[] } | null, perm: Permission) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.permissions.includes(perm);
}
