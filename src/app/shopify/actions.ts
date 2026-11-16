"use server";

import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { fetchShopifyImages, fetchShopifyVariants, pushStock, shopifyConfig } from "@/lib/shopify";
import { compare, type Comparison, type FoursVariant, type Row } from "@/lib/shopifyCompare";
import { planStockPush } from "@/lib/shopifyPush";

export type CompareState = { error?: string; result?: Comparison; seconds?: number } | null;

async function loadFours() {
  return query<FoursVariant>(
    `SELECT v.sku, v.barcode, p.name, v.size, v.colour, (v.active AND p.active) AS active,
            COALESCE(jsonb_object_agg(l.code, s.qty) FILTER (WHERE l.code IS NOT NULL), '{}'::jsonb) AS stock
       FROM variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock s ON s.variant_id = v.id
       LEFT JOIN locations l ON l.id = s.location_id
      GROUP BY v.id, p.id`,
  );
}

async function adminAndConfig() {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." } as const;
  const cfg = shopifyConfig();
  if (!cfg) {
    return { error: "Shopify is not set up yet. Add SHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel, then redeploy." } as const;
  }
  return { cfg } as const;
}

/** Reads Shopify and fourshub and lists the differences. Changes nothing in either. */
export async function runComparison(): Promise<CompareState> {
  const a = await adminAndConfig();
  if ("error" in a) return { error: a.error };
  const started = Date.now();
  try {
    const fours = await loadFours();
    const shopify = await fetchShopifyVariants(a.cfg);
    return { result: compare(fours, shopify), seconds: Math.round((Date.now() - started) / 1000) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The comparison failed." };
  }
}

export type PushPreviewState = {
  error?: string;
  items?: number; changes?: number; notStocked?: number; untracked?: number; rows?: Row[];
} | null;

/** Shows what a stock push would change in Shopify. Changes nothing. */
export async function previewPush(): Promise<PushPreviewState> {
  const a = await adminAndConfig();
  if ("error" in a) return { error: a.error };
  try {
    const plan = planStockPush(await loadFours(), await fetchShopifyVariants(a.cfg));
    return { items: plan.items, changes: plan.changes.length, notStocked: plan.notStocked, untracked: plan.untracked, rows: plan.rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The preview failed." };
  }
}

export type PushState = { error?: string; summary?: string; problems?: string[] } | null;

/**
 * Sends fourshub's total stock to Shopify. Switched off unless SHOPIFY_SYNC=on, because fourshub's numbers
 * must be current before they replace Shopify's. Shopify refuses any item whose stock moved since it was read.
 */
export async function pushStockToShopify(_prev: PushState, form: FormData): Promise<PushState> {
  const a = await adminAndConfig();
  if ("error" in a) return { error: a.error };
  if (process.env.SHOPIFY_SYNC !== "on") return { error: "Sending stock to Shopify is switched off. Set SHOPIFY_SYNC=on in Vercel and redeploy to allow it." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  const limitRaw = String(form.get("limit") ?? "").trim();
  const limit = limitRaw === "" ? Infinity : Math.max(1, Math.floor(Number(limitRaw)));
  if (!Number.isFinite(limit) && limitRaw !== "") return { error: "Type a whole number, or leave it empty to send everything." };

  try {
    const plan = planStockPush(await loadFours(), await fetchShopifyVariants(a.cfg));
    // A limit counts items, not single changes, so one item is never half done.
    const skus = [...new Set(plan.changes.map((c) => c.sku))].slice(0, limit);
    const chosen = new Set(skus);
    const changes = plan.changes.filter((c) => chosen.has(c.sku));
    if (changes.length === 0) return { summary: "Nothing to send: Shopify already has the same stock." };
    const r = await pushStock(a.cfg, changes);
    return {
      summary: `Sent ${r.applied} of ${changes.length} stock changes (${skus.length} items) to Shopify.${r.stoppedEarly ? " Stopped early to stay within the time limit: run it again for the rest." : ""}${r.failed.length ? ` ${r.failed.length} were refused.` : ""}`,
      problems: r.failed.slice(0, 20).map((f) => `${f.sku}: ${f.message}`),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The push failed." };
  }
}

export type PicturesState = { error?: string; loaded?: number; matched?: number } | null;

/** Reads the pictures from Shopify and keeps them by SKU. Changes nothing in Shopify. */
export async function loadPictures(): Promise<PicturesState> {
  const a = await adminAndConfig();
  if ("error" in a) return { error: a.error };
  try {
    const images = await fetchShopifyImages(a.cfg);
    for (let i = 0; i < images.length; i += 1000) {
      const part = images.slice(i, i + 1000);
      await query(
        `INSERT INTO item_images (sku, url) SELECT * FROM unnest($1::text[], $2::text[])
         ON CONFLICT (sku) DO UPDATE SET url = EXCLUDED.url, updated_at = now()`,
        [part.map((x) => x.sku), part.map((x) => x.url)]);
    }
    const m = await query<{ n: number }>("SELECT count(*)::int AS n FROM variants v JOIN item_images i ON i.sku = v.sku");
    return { loaded: images.length, matched: m[0]?.n ?? 0 };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Loading the pictures failed." };
  }
}
