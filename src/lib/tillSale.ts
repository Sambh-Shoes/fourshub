// Writes one till sale: the ticket, its lines and payments, the pairs leaving the shop, the loyalty points.
// It takes an open transaction, so it either all happens or nothing does. Kept apart from the screen's actions
// so it can be tested against a real database.
import type { Receipt } from "./receipt";
import type { Pricing, PaymentResult } from "./till";

export type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export type SaleContext = {
  ref: string;
  shop: { id: number; code: string };
  user: { id: number };
  approvedBy: number | null;
  customer: { id: number } | null;
  priced: Pricing;
  pay: PaymentResult;
  items: Map<number, { sku: string | null; name: string; colour: string | null; size: string | null }>;
  /** Builds the receipt once the ticket number, time and the customer's points before the sale are known. */
  build: (ticketNo: string, soldAt: string, pointsBefore: number) => Receipt;
};

export async function saveSale(db: Db, c: SaleContext): Promise<Receipt> {
  const dup = await db.query("SELECT receipt FROM sales WHERE till_ref = $1", [c.ref]);
  if (dup.rows[0]?.receipt) return dup.rows[0].receipt as Receipt; // already saved: show the same ticket

  const { priced, pay } = c;
  let pointsBefore = 0;
  if (c.customer) {
    const row = await db.query("SELECT points::float AS points FROM customers WHERE id = $1 FOR UPDATE", [c.customer.id]);
    pointsBefore = row.rows[0].points;
    if (priced.pointsSpent > pointsBefore) throw new Error("The customer's points changed. Check the reward and try again.");
  }

  const clock = await db.query("SELECT now() AS now, extract(year FROM now() AT TIME ZONE 'Europe/Madrid')::int AS year");
  const { now, year } = clock.rows[0];
  const counter = await db.query(
    `INSERT INTO ticket_counters (location_id, year, last) VALUES ($1, $2, 1)
     ON CONFLICT (location_id, year) DO UPDATE SET last = ticket_counters.last + 1 RETURNING last`,
    [c.shop.id, year]);
  const ticketNo = `${c.shop.code}/${year}/${String(counter.rows[0].last).padStart(6, "0")}`;
  const receipt = c.build(ticketNo, new Date(now).toISOString(), pointsBefore);

  const sale = await db.query(
    `INSERT INTO sales (number, reference, location_id, customer_id, cashier, sold_at, total, tax, source, till_ref, user_id, approved_by, receipt)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'till', $9, $10, $11, $12) RETURNING id`,
    [ticketNo, c.ref, c.shop.id, c.customer?.id ?? null, receipt.cashier, now, priced.totalCents / 100, priced.vatCents / 100,
     c.ref, c.user.id, c.approvedBy, JSON.stringify(receipt)]);
  const saleId: number = sale.rows[0].id;

  for (const l of priced.lines) {
    const v = c.items.get(l.variantId)!;
    const detail = [v.colour, v.size].filter(Boolean).join(", ");
    await db.query(
      `INSERT INTO sale_lines (sale_id, sku, name, qty, unit_price, discount, total, variant_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [saleId, v.sku, detail ? `${v.name} (${detail})` : v.name, l.qty, l.unitCents / 100, l.discount, l.lineCents / 100, l.variantId]);
  }
  if (priced.rewards > 0) {
    await db.query(
      `INSERT INTO sale_lines (sale_id, sku, name, qty, unit_price, discount, total) VALUES ($1, NULL, 'Loyalty reward (100 points)', $2, -10, 0, $3)`,
      [saleId, priced.rewards, -priced.rewardCents / 100]);
  }
  if (pay.cashCents > 0) await db.query("INSERT INTO sale_payments (sale_id, method, amount, paid_at) VALUES ($1, 'cash', $2, now())", [saleId, pay.cashCents / 100]);
  if (pay.cardCents > 0) await db.query("INSERT INTO sale_payments (sale_id, method, amount, paid_at) VALUES ($1, 'card', $2, now())", [saleId, pay.cardCents / 100]);

  // Stock leaves this shop. It never goes below zero: if the system had fewer pairs than were sold, say so.
  const sold = new Map<number, number>();
  for (const l of priced.lines) sold.set(l.variantId, (sold.get(l.variantId) ?? 0) + l.qty);
  for (const [variantId, qty] of sold) {
    await db.query("INSERT INTO stock (variant_id, location_id, qty) VALUES ($1, $2, 0) ON CONFLICT (variant_id, location_id) DO NOTHING", [variantId, c.shop.id]);
    const cur = await db.query("SELECT qty FROM stock WHERE variant_id = $1 AND location_id = $2 FOR UPDATE", [variantId, c.shop.id]);
    const removed = Math.min(qty, Math.max(0, cur.rows[0].qty));
    if (removed > 0) {
      await db.query("UPDATE stock SET qty = qty - $3 WHERE variant_id = $1 AND location_id = $2", [variantId, c.shop.id, removed]);
      await db.query("INSERT INTO stock_moves (variant_id, from_location, qty, reason, user_id) VALUES ($1, $2, $3, 'sale', $4)", [variantId, c.shop.id, removed, c.user.id]);
    }
    if (removed < qty) {
      const v = c.items.get(variantId)!;
      receipt.warnings.push(`${v.name} ${[v.colour, v.size].filter(Boolean).join(" ")}: the system had ${removed} here but ${qty} were sold. Check the count.`);
    }
  }

  if (c.customer) {
    await db.query("UPDATE customers SET points = points + $2 WHERE id = $1", [c.customer.id, priced.pointsEarned - priced.pointsSpent]);
    if (priced.pointsEarned > 0) await db.query("INSERT INTO loyalty_moves (customer_id, sale_id, points, reason) VALUES ($1, $2, $3, $4)", [c.customer.id, saleId, priced.pointsEarned, `sale ${ticketNo}`]);
    if (priced.pointsSpent > 0) await db.query("INSERT INTO loyalty_moves (customer_id, sale_id, points, reason) VALUES ($1, $2, $3, $4)", [c.customer.id, saleId, -priced.pointsSpent, `reward on ${ticketNo}`]);
  }
  await db.query("UPDATE sales SET receipt = $2 WHERE id = $1", [saleId, JSON.stringify(receipt)]); // now with any warnings
  return receipt;
}
