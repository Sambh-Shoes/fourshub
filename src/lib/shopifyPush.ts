// Works out what to change in Shopify so its stock equals fourshub's. Pure logic: no database, no network.
// The online shop sells the total of every shop and the warehouse, and Shopify keeps that total in one
// location ("Fours Shoes"), so that location gets the total and the other Shopify locations get 0.
import type { ShopifyVariant, StockChange } from "./shopify";
import type { FoursVariant, Row } from "./shopifyCompare";

export const MAIN_SHOPIFY_LOCATION = "Fours Shoes";

export type PushPlan = {
  changes: StockChange[];
  rows: Row[]; // what the screen shows (first 200)
  items: number; // variants that change
  notStocked: number; // fourshub has pairs but Shopify does not stock the item at the main location
  untracked: number; // Shopify does not count these, so they are left alone
};

const sum = (o: Record<string, number>) => Object.values(o).reduce((n, v) => n + v, 0);

export function planStockPush(fours: FoursVariant[], shopify: ShopifyVariant[]): PushPlan {
  const foursBySku = new Map<string, FoursVariant>();
  for (const f of fours) if (f.sku && !foursBySku.has(f.sku)) foursBySku.set(f.sku, f);

  const seen = new Set<string>();
  const changes: StockChange[] = [];
  const rows: Row[] = [];
  let items = 0;
  let notStocked = 0;
  let untracked = 0;

  for (const s of shopify) {
    if (!s.sku || seen.has(s.sku)) continue; // no SKU, or a SKU used twice: not safe to touch
    seen.add(s.sku);
    const f = foursBySku.get(s.sku);
    if (!f || !s.inventoryItemId) continue;
    if (!s.tracked) { untracked++; continue; }

    const total = sum(f.stock);
    const mine: StockChange[] = [];
    const mainId = s.locationIds[MAIN_SHOPIFY_LOCATION];
    const mainNow = s.stock[MAIN_SHOPIFY_LOCATION] ?? 0;
    if (mainId) {
      if (mainNow !== total) mine.push({ sku: s.sku, inventoryItemId: s.inventoryItemId, locationId: mainId, from: mainNow, to: total });
    } else if (total > 0) {
      notStocked++;
      continue;
    }
    for (const [name, qty] of Object.entries(s.stock)) {
      const id = s.locationIds[name];
      if (name === MAIN_SHOPIFY_LOCATION || qty === 0 || !id) continue;
      mine.push({ sku: s.sku, inventoryItemId: s.inventoryItemId, locationId: id, from: qty, to: 0 });
    }
    if (mine.length === 0) continue;
    items++;
    changes.push(...mine);
    if (rows.length < 200) {
      const label = [f.name, f.colour, f.size].filter(Boolean).join(" · ");
      const nameOf = (id: string) => Object.entries(s.locationIds).find(([, v]) => v === id)?.[0] ?? "?";
      rows.push({ sku: s.sku, label, note: mine.map((c) => `${nameOf(c.locationId)} ${c.from} → ${c.to}`).join(" · ") });
    }
  }
  return { changes, rows, items, notStocked, untracked };
}
