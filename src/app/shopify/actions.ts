"use server";

import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fetchShopifyVariants, shopifyConfig } from "@/lib/shopify";
import { compare, type Comparison, type FoursVariant } from "@/lib/shopifyCompare";

export type CompareState = { error?: string; result?: Comparison; seconds?: number } | null;

/** Reads Shopify and fourshub and lists the differences. Changes nothing in either. */
export async function runComparison(): Promise<CompareState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." };
  const cfg = shopifyConfig();
  if (!cfg) {
    return { error: "Shopify is not set up yet. Add SHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel, then redeploy." };
  }
  const started = Date.now();
  try {
    const fours = await query<FoursVariant>(
      `SELECT v.sku, v.barcode, p.name, v.size, v.colour, (v.active AND p.active) AS active,
              COALESCE(jsonb_object_agg(l.code, s.qty) FILTER (WHERE l.code IS NOT NULL), '{}'::jsonb) AS stock
         FROM variants v
         JOIN products p ON p.id = v.product_id
         LEFT JOIN stock s ON s.variant_id = v.id
         LEFT JOIN locations l ON l.id = s.location_id
        GROUP BY v.id, p.id`,
    );
    const shopify = await fetchShopifyVariants(cfg);
    return { result: compare(fours, shopify), seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The comparison failed." };
  }
}
