"use server";

import { requireUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { fetchOrders, shopifyConfig, type ShopifyOrder } from "@/lib/shopify";
import { planLine, type OrderLineState, type Stock, type Taken } from "@/lib/orderAllocation";

export type OrderRow = { order: string; sku: string; item: string; note: string };
export type OrdersState = {
  error?: string;
  summary?: string;
  orders?: number; // orders with something to do
  take?: number; putBack?: number; missing?: number;
  unknownSku?: string[];
  rows?: OrderRow[];
} | null;

type Planned = {
  order: ShopifyOrder;
  lines: { state: OrderLineState; variantId: number | null; change: ReturnType<typeof planLine> | null }[];
};

const SINCE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

function sinceFromEnv(): string | null {
  const v = process.env.SHOPIFY_ORDERS_FROM?.trim();
  return v && SINCE_RE.test(v) ? v : null;
}

/** Reads the orders and works out what each one changes. Writes nothing. */
async function plan(): Promise<{ error: string } | { planned: Planned[]; unknown: string[]; locations: Map<string, number>; since: string }> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." };
  const cfg = shopifyConfig();
  if (!cfg) return { error: "Shopify is not set up yet (SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET)." };
  const since = sinceFromEnv();
  if (!since) {
    return { error: "Set SHOPIFY_ORDERS_FROM in Vercel to the day you stop using Odoo (for example 2026-12-01) and redeploy. Orders before that day are already in the Odoo stock and are never applied." };
  }

  const orders = (await fetchOrders(cfg, since)).filter((o) => o.createdAt >= since);
  if (orders.length === 0) return { planned: [], unknown: [], locations: new Map(), since };

  const skus = [...new Set(orders.flatMap((o) => o.lines.map((l) => l.sku).filter((s): s is string => !!s)))];
  const variants = await query<{ id: number; sku: string; stock: Stock }>(
    `SELECT v.id, v.sku,
            COALESCE(jsonb_object_agg(l.code, s.qty) FILTER (WHERE l.code IS NOT NULL), '{}'::jsonb) AS stock
       FROM variants v
       LEFT JOIN stock s ON s.variant_id = v.id
       LEFT JOIN locations l ON l.id = s.location_id
      WHERE v.sku = ANY($1)
      GROUP BY v.id`,
    [skus],
  );
  const bySku = new Map<string, { id: number; stock: Stock }>();
  for (const v of variants) if (!bySku.has(v.sku)) bySku.set(v.sku, { id: v.id, stock: { ...v.stock } });

  const applied = await query<{ shopify_line_id: string; qty: number; taken: Taken; missing: number }>(
    `SELECT shopify_line_id, qty, taken, missing FROM online_order_lines WHERE order_id = ANY($1)`,
    [orders.map((o) => o.id)],
  );
  const appliedByLine = new Map(applied.map((a) => [a.shopify_line_id, a]));
  const locations = new Map((await query<{ code: string; id: number }>("SELECT code, id FROM locations")).map((l) => [l.code, l.id]));

  const unknown = new Set<string>();
  const planned: Planned[] = [];
  // Oldest first, so earlier orders get the pairs first.
  for (const order of [...orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const lines: Planned["lines"] = [];
    for (const l of order.lines) {
      const prev = appliedByLine.get(l.id);
      const desired = order.cancelled ? 0 : l.qty;
      const state: OrderLineState = {
        lineId: l.id, sku: l.sku ?? "", desired,
        appliedTaken: prev?.taken ?? [], appliedMissing: prev?.missing ?? 0,
      };
      if (!l.sku) { unknown.add(`${order.name}: item without a SKU`); lines.push({ state, variantId: null, change: null }); continue; }
      const v = bySku.get(l.sku);
      if (!v) { unknown.add(`${order.name}: ${l.sku}`); lines.push({ state, variantId: null, change: null }); continue; }
      const change = planLine(state, v.stock);
      lines.push({ state, variantId: v.id, change });
    }
    planned.push({ order, lines });
  }
  return { planned, unknown: [...unknown], locations, since };
}

const nothingToDo = (c: ReturnType<typeof planLine>, prevMissing: number) =>
  c.take.length === 0 && c.putBack.length === 0 && c.missing === prevMissing;

function describe(p: Planned[]): { orders: number; take: number; putBack: number; missing: number; rows: OrderRow[] } {
  let orders = 0, take = 0, putBack = 0, missing = 0;
  const rows: OrderRow[] = [];
  for (const { order, lines } of p) {
    let touched = false;
    for (const { state, change } of lines) {
      if (!change || nothingToDo(change, state.appliedMissing)) continue;
      touched = true;
      const t = change.take.reduce((n, [, v]) => n + v, 0);
      const b = change.putBack.reduce((n, [, v]) => n + v, 0);
      take += t; putBack += b; missing += Math.max(0, change.missing - state.appliedMissing);
      const parts = [
        ...change.take.map(([c, n]) => `takes ${n} from ${c}`),
        ...change.putBack.map(([c, n]) => `returns ${n} to ${c}`),
        ...(change.missing > state.appliedMissing ? [`${change.missing - state.appliedMissing} not found in any location`] : []),
      ];
      if (rows.length < 200) rows.push({ order: order.name, sku: state.sku, item: order.cancelled ? "cancelled" : "", note: parts.join(" · ") });
    }
    if (touched) orders++;
  }
  return { orders, take, putBack, missing, rows };
}

/** Shows what applying the online orders would change. Changes nothing. */
export async function previewOrders(): Promise<OrdersState> {
  try {
    const r = await plan();
    if ("error" in r) return { error: r.error };
    const d = describe(r.planned);
    return { orders: d.orders, take: d.take, putBack: d.putBack, missing: d.missing, unknownSku: r.unknown, rows: d.rows };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The preview failed." };
  }
}

/** Takes the pairs of new online orders out of stock (and returns them for cancelled ones). Gated by SHOPIFY_ORDERS=on. */
export async function applyOrders(_prev: OrdersState, form: FormData): Promise<OrdersState> {
  if (process.env.SHOPIFY_ORDERS !== "on") return { error: "Applying online orders is switched off. Set SHOPIFY_ORDERS=on in Vercel and redeploy to allow it." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };
  try {
    const r = await plan();
    if ("error" in r) return { error: r.error };
    const user = await requireUser();
    let orders = 0, take = 0, putBack = 0, missing = 0;

    await transaction(async (db) => {
      for (const { order, lines } of r.planned) {
        const todo = lines.filter((l) => l.change && l.variantId !== null);
        if (todo.length === 0) continue;
        await db.query(
          `INSERT INTO online_orders (shopify_id, name, created_at, cancelled) VALUES ($1, $2, $3, $4)
           ON CONFLICT (shopify_id) DO UPDATE SET cancelled = EXCLUDED.cancelled, name = EXCLUDED.name`,
          [order.id, order.name, order.createdAt, order.cancelled],
        );
        let touched = false;
        for (const { state, variantId, change } of todo) {
          const c = change!;
          if (nothingToDo(c, state.appliedMissing)) continue;
          for (const [code, n] of c.take) await moveStock(db, variantId!, r.locations.get(code)!, -n, `online order ${order.name}`, user.id);
          for (const [code, n] of c.putBack) await moveStock(db, variantId!, r.locations.get(code)!, n, `online order ${order.name} changed`, user.id);
          await db.query(
            `INSERT INTO online_order_lines (shopify_line_id, order_id, sku, qty, taken, missing) VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (shopify_line_id) DO UPDATE SET qty = EXCLUDED.qty, taken = EXCLUDED.taken, missing = EXCLUDED.missing`,
            [state.lineId, order.id, state.sku, state.desired, JSON.stringify(c.taken), c.missing],
          );
          take += c.take.reduce((n, [, v]) => n + v, 0);
          putBack += c.putBack.reduce((n, [, v]) => n + v, 0);
          missing += Math.max(0, c.missing - state.appliedMissing);
          touched = true;
        }
        if (touched) orders++;
      }
    });
    return {
      summary: `Applied ${orders} orders: ${take} pairs taken out of stock, ${putBack} returned${missing ? `, ${missing} not found in any location (check them)` : ""}.`,
      unknownSku: r.unknown,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Applying the orders failed." };
  }
}

type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

/** Changes one stock row and logs it, the same way every other stock change is logged. */
async function moveStock(db: Tx, variantId: number, locationId: number, delta: number, reason: string, userId: number) {
  await db.query(
    `INSERT INTO stock (variant_id, location_id, qty) VALUES ($1, $2, GREATEST(0, $3))
     ON CONFLICT (variant_id, location_id) DO UPDATE SET qty = GREATEST(0, stock.qty + $3)`,
    [variantId, locationId, delta],
  );
  await db.query(
    `INSERT INTO stock_moves (variant_id, from_location, to_location, qty, reason, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [variantId, delta < 0 ? locationId : null, delta > 0 ? locationId : null, Math.abs(delta), reason, userId],
  );
}
