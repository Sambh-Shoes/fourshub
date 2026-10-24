import { query } from "./db";

export type Location = { id: number; code: string; name: string; kind: "shop" | "warehouse" };

export function getLocations() {
  return query<Location>("SELECT id, code, name, kind FROM locations WHERE active ORDER BY sort, id");
}

export function getCategories() {
  return query<{ id: number; name: string }>("SELECT id, name FROM categories ORDER BY name");
}
