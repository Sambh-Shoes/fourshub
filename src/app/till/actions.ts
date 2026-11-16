"use server";

import bcrypt from "bcryptjs";
import { requireUser } from "@/lib/auth";
import { one, query, transaction } from "@/lib/db";
import { can } from "@/lib/permissions";
import { COMPANY, type Receipt } from "@/lib/receipt";
import { priceCart, settle } from "@/lib/till";
import { saveSale } from "@/lib/tillSale";

export type ItemHit = {
  variantId: number; name: string; reference: string | null; colour: string | null; size: string | null;
  barcode: string | null; image: string | null; priceCents: number; here: number; elsewhere: number;
};

/** A scanned barcode or SKU finds its item; words find items by name, reference, colour. */
export async function searchItems(q: string, locationId: number): Promise<ItemHit[]> {
  await requireUser("till.use");
  const text = q.trim().slice(0, 80);
  if (text.length < 2) return [];
  const words = text.split(/\s+/).slice(0, 5).map((w) => `%${w.replace(/[%_\\]/g, "")}%`);
  return query<ItemHit>(
    `SELECT v.id AS "variantId", p.name, p.reference, v.colour, v.size, v.barcode, i.url AS image,
            round(coalesce(v.price, p.price) * 100)::int AS "priceCents",
            coalesce(sum(s.qty) FILTER (WHERE s.location_id = $2), 0)::int AS here,
            coalesce(sum(s.qty) FILTER (WHERE s.location_id <> $2), 0)::int AS elsewhere
       FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN stock s ON s.variant_id = v.id LEFT JOIN item_images i ON i.sku = v.sku
      WHERE v.active AND p.active
        AND (v.barcode = $1 OR v.sku = $1 OR v.id = (SELECT variant_id FROM barcode_aliases WHERE barcode = $1)
             OR (p.name || ' ' || coalesce(p.reference, '') || ' ' || coalesce(v.colour, '') || ' ' || coalesce(v.sku, '')) ILIKE ALL($3::text[]))
      GROUP BY v.id, p.id, i.url ORDER BY p.name, v.colour, v.size LIMIT 40`,
    [text, locationId, words]);
}

export type CustomerHit = { id: number; name: string; email: string | null; phone: string | null; points: number };

export async function findCustomers(q: string): Promise<CustomerHit[]> {
  await requireUser("till.use");
  const text = q.trim().slice(0, 60);
  if (text.length < 2) return [];
  const like = `%${text.replace(/[%_\\]/g, "")}%`;
  return query<CustomerHit>(
    `SELECT id, name, email, phone, points::float AS points FROM customers
      WHERE active AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1) ORDER BY name LIMIT 8`,
    [like]);
}

export async function createCustomer(name: string, phone: string, email: string): Promise<CustomerHit | { error: string }> {
  await requireUser("till.use");
  const n = name.trim();
  if (n.length < 2) return { error: "Write the customer's name." };
  if (!phone.trim() && !email.trim()) return { error: "Add a phone or an email, so the customer can be found again." };
  const row = await one<CustomerHit>(
    `INSERT INTO customers (name, email, phone) VALUES ($1, $2, $3) RETURNING id, name, email, phone, points::float AS points`,
    [n.slice(0, 120), email.trim().slice(0, 120) || null, phone.trim().slice(0, 40) || null]);
  return row!;
}

export type SaleInput = {
  ref: string; // made by the screen per ticket: sending it twice never sells twice
  locationId: number;
  customerId: number | null;
  lines: { variantId: number; qty: number; discount: number }[];
  rewards: number;
  cardCents: number;
  cashGivenCents: number;
  approver?: { username: string; password: string };
};
export type SaleResult = { error?: string; needsApproval?: boolean; receipt?: Receipt };

/**
 * Rings up a sale. Prices come from the database, never from the screen. With TILL_LIVE=on the sale is saved,
 * the pairs leave the shop's stock and the points move, all in one go. Without it, it is practice: the ticket is
 * worked out and returned, and nothing is written.
 */
export async function completeSale(input: SaleInput): Promise<SaleResult> {
  const user = await requireUser("till.use");
  if (!/^[\w-]{8,64}$/.test(input.ref)) return { error: "Start the ticket again." };
  if (input.lines.length === 0) return { error: "The ticket is empty." };
  if (input.lines.length > 60) return { error: "Too many lines on one ticket." };
  if (user.location_id && user.location_id !== input.locationId && !can(user, "discounts.high")) {
    return { error: "You can only sell from your own shop." };
  }
  const shop = await one<{ id: number; code: string; name: string }>(
    "SELECT id, code, name FROM locations WHERE id = $1 AND kind = 'shop' AND active", [input.locationId]);
  if (!shop) return { error: "Choose the shop." };

  const variants = await query<{ id: number; sku: string | null; size: string | null; colour: string | null; name: string; cents: number }>(
    `SELECT v.id, v.sku, v.size, v.colour, p.name, round(coalesce(v.price, p.price) * 100)::int AS cents
       FROM variants v JOIN products p ON p.id = v.product_id WHERE v.id = ANY($1) AND v.active AND p.active`,
    [input.lines.map((l) => l.variantId)]);
  const byId = new Map(variants.map((v) => [v.id, v]));
  if (input.lines.some((l) => !byId.has(l.variantId))) return { error: "An item on the ticket is no longer for sale." };

  const customer = input.customerId
    ? await one<{ id: number; name: string; points: number }>("SELECT id, name, points::float AS points FROM customers WHERE id = $1 AND active", [input.customerId])
    : null;
  if (input.customerId && !customer) return { error: "That customer was not found." };

  const priced = priceCart(
    input.lines.map((l) => ({ variantId: l.variantId, unitCents: byId.get(l.variantId)!.cents, qty: l.qty, discount: l.discount })),
    { hasCustomer: !!customer, customerPoints: customer?.points ?? 0, rewards: input.rewards },
  );
  if (priced.errors.length) return { error: priced.errors[0] };
  if (priced.totalCents <= 0) return { error: "There is nothing to pay." };

  // A discount above the staff limit needs a manager's own login.
  let approvedBy: number | null = null;
  if (priced.needsApproval && !can(user, "discounts.high")) {
    const a = input.approver;
    if (!a?.username?.trim()) return { needsApproval: true, error: "A discount above 30% needs a manager." };
    const m = await one<{ id: number; password_hash: string; role: "admin" | "manager" | "shop" | "warehouse"; permissions: string[] }>(
      "SELECT id, password_hash, role, permissions FROM users WHERE lower(username) = lower($1) AND active", [a.username.trim()]);
    if (!m || !(await bcrypt.compare(a.password ?? "", m.password_hash)) || !can(m, "discounts.high")) {
      return { needsApproval: true, error: "That manager login is not valid." };
    }
    approvedBy = m.id;
  }

  const pay = settle(priced.totalCents, { cardCents: input.cardCents, cashGivenCents: input.cashGivenCents });
  if (!pay.ok) return { error: pay.error };

  const live = process.env.TILL_LIVE === "on";
  const build = (ticketNo: string, soldAt: string, pointsBefore: number): Receipt => ({
    practice: !live,
    company: { name: COMPANY.name, nif: COMPANY.nif, address: COMPANY.address, web: COMPANY.web },
    ticketNo, soldAt, shop: shop.name, cashier: user.name,
    customer: customer ? { name: customer.name, pointsBefore, pointsAfter: Math.round((pointsBefore + priced.pointsEarned - priced.pointsSpent) * 100) / 100 } : null,
    lines: priced.lines.map((l) => {
      const v = byId.get(l.variantId)!;
      return { name: v.name, detail: [v.colour, v.size].filter(Boolean).join(" · "), qty: l.qty, unitCents: l.unitCents, discount: l.discount, lineCents: l.lineCents };
    }),
    rewardCents: priced.rewardCents, savedCents: priced.savedCents, totalCents: priced.totalCents, vatCents: priced.vatCents,
    cashCents: pay.cashCents, cardCents: pay.cardCents, givenCents: pay.cashCents + pay.changeCents, changeCents: pay.changeCents,
    warnings: [],
  });

  if (!live) return { receipt: build("PRACTICE", new Date().toISOString(), customer?.points ?? 0) };

  try {
    const receipt = await transaction((db) =>
      saveSale(db, { ref: input.ref, shop, user, approvedBy, customer, priced, pay, items: byId, build }));
    return { receipt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The sale could not be saved. Nothing was changed." };
  }
}
