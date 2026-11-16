// Compares what fourshub knows with what is in Shopify. Pure logic, no database or network.
import type { ShopifyVariant } from "./shopify";

// Shopify location name -> fourshub location code.
export const SHOPIFY_LOCATIONS: Record<string, string> = {
  "Fours Shoes": "GRA", // the Gracia shop
  "Fours Jaume": "JAU",
  "Fours Galla Placidia": "PLA",
  Warehouse: "ALM",
};

export type FoursVariant = {
  sku: string | null;
  barcode: string | null;
  name: string;
  size: string | null;
  colour: string | null;
  active: boolean;
  stock: Record<string, number>; // fourshub location code -> pairs
};

export type Row = { sku: string; label: string; note: string };

export type Comparison = {
  shopifyVariants: number;
  foursVariants: number;
  matched: number;
  stockSame: number;
  stockDiffers: number;
  onlyShopify: { total: number; rows: Row[] };
  onlyFourshubInStock: { total: number; pairs: number; rows: Row[] };
  shopifyNoSku: { total: number; rows: Row[] };
  duplicateSkus: { total: number; rows: Row[] };
  stockDiffs: { total: number; rows: Row[] };
  unknownLocations: string[];
};

const LIMIT = 200;
const cap = (rows: Row[]) => ({ total: rows.length, rows: rows.slice(0, LIMIT) });
const sum = (o: Record<string, number>) => Object.values(o).reduce((n, v) => n + v, 0);
const where = (o: Record<string, number>) => {
  const parts = Object.entries(o).filter(([, n]) => n !== 0).map(([k, n]) => `${k} ${n}`);
  return parts.length ? parts.join(", ") : "none";
};
const shopifyLabel = (v: ShopifyVariant) => `${v.productTitle} · ${v.title}`;
const foursLabel = (v: FoursVariant) => [v.name, v.colour, v.size].filter(Boolean).join(" · ");

export function compare(fours: FoursVariant[], shopify: ShopifyVariant[]): Comparison {
  const foursBySku = new Map<string, FoursVariant>();
  for (const f of fours) if (f.sku && !foursBySku.has(f.sku)) foursBySku.set(f.sku, f);

  const shopifyBySku = new Map<string, ShopifyVariant>();
  const duplicates: Row[] = [];
  const noSku: Row[] = [];
  for (const s of shopify) {
    if (!s.sku) { noSku.push({ sku: "", label: shopifyLabel(s), note: s.status }); continue; }
    if (shopifyBySku.has(s.sku)) { duplicates.push({ sku: s.sku, label: shopifyLabel(s), note: "SKU used twice in Shopify" }); continue; }
    shopifyBySku.set(s.sku, s);
  }

  const onlyShopify: Row[] = [];
  const stockDiffs: Row[] = [];
  let matched = 0;
  let stockSame = 0;
  const unknown = new Set<string>();

  for (const [sku, s] of shopifyBySku) {
    for (const name of Object.keys(s.stock)) if (!(name in SHOPIFY_LOCATIONS)) unknown.add(name);
    const f = foursBySku.get(sku);
    if (!f) { onlyShopify.push({ sku, label: shopifyLabel(s), note: s.status }); continue; }
    matched++;
    if (!s.tracked) { stockSame++; continue; } // Shopify is not counting this one
    // The online shop sells from the total of every shop and the warehouse, and Shopify keeps that total
    // in one location, so compare totals and show where the pairs are in each system.
    const shopifyTotal = sum(s.stock);
    const foursTotal = sum(f.stock);
    if (shopifyTotal === foursTotal) { stockSame++; continue; }
    stockDiffs.push({
      sku,
      label: foursLabel(f),
      note: `Shopify ${shopifyTotal} (${where(s.stock)}) · fourshub ${foursTotal} (${where(f.stock)})`,
    });
  }

  const onlyFours: Row[] = [];
  let onlyFoursPairs = 0;
  for (const [sku, f] of foursBySku) {
    if (shopifyBySku.has(sku)) continue;
    // Only the ones with pairs somewhere matter; the rest are old Odoo items.
    const pairs = sum(f.stock);
    if (!f.active || pairs <= 0) continue;
    onlyFoursPairs += pairs;
    onlyFours.push({ sku, label: foursLabel(f), note: `${pairs} pairs` });
  }

  return {
    shopifyVariants: shopify.length,
    foursVariants: fours.length,
    matched,
    stockSame,
    stockDiffers: stockDiffs.length,
    onlyShopify: cap(onlyShopify),
    onlyFourshubInStock: { ...cap(onlyFours), pairs: onlyFoursPairs },
    shopifyNoSku: cap(noSku),
    duplicateSkus: cap(duplicates),
    stockDiffs: cap(stockDiffs),
    unknownLocations: [...unknown],
  };
}
