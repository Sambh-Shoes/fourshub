// Loads customers, loyalty points and the shops' sales history from Odoo tables into fourshub.
// Used by the upload page in the app and by the command line. Everything is worked out in memory first and
// written with a few bulk inserts in one transaction, so it either all loads or nothing changes.
import { parseTable, tr } from "./odoo.mjs";

export { parseTable };

const nul = (v) => (v == null ? null : String(v).trim() || null);
const num = (v) => (v == null || v === "" ? 0 : Number(v));
const name = (v) => (v && v.trim().startsWith("{") ? tr(v) : nul(v));

// Odoo POS shop name -> fourshub location code.
export function locationCode(posConfigName) {
  const n = (tr(posConfigName) ?? "").toLowerCase();
  if (n.includes("gracia")) return "GRA";
  if (n.includes("jaume")) return "JAU";
  if (n.includes("placidia")) return "PLA";
  return null;
}

// How the customer paid: Odoo has Cash / Bank (the card terminal) per shop.
export function paymentKind(methodName) {
  const n = (tr(methodName) ?? "").toLowerCase();
  if (n.includes("cash")) return "cash";
  if (n.includes("bank")) return "card";
  return n || "other";
}

const isWalkIn = (p) => /simplified invoice partner/i.test(p.name ?? "");

/**
 * @param db a connected pg client (not inside a transaction)
 * @param source (tableName) => rows, see lib/odoo.mjs
 */
export async function runSalesImport(db, source) {
  const partners = source("res_partner");
  const orders = source("pos_order");
  const lines = source("pos_order_line");
  const payments = source("pos_payment");
  const methods = new Map(source("pos_payment_method").map((m) => [m.id, m.name]));
  const configs = new Map(source("pos_config").map((c) => [c.id, c.name]));
  const skuByProduct = new Map(source("product_product").map((p) => [p.id, nul(p.default_code)]));

  // Loyalty points of the active "Fours Loyalty"-type programme, per customer.
  const loyaltyPrograms = new Set(source("loyalty_program").filter((p) => p.program_type === "loyalty").map((p) => p.id));
  const points = new Map();
  for (const c of source("loyalty_card")) {
    if (!loyaltyPrograms.has(c.program_id) || c.partner_id == null) continue;
    points.set(c.partner_id, (points.get(c.partner_id) ?? 0) + num(c.points));
  }

  const SOLD = new Set(["paid", "done", "invoiced"]);
  const soldOrders = orders.filter((o) => SOLD.has(o.state));
  const walkInIds = new Set(partners.filter(isWalkIn).map((p) => p.id));
  const usedBy = new Set(soldOrders.map((o) => o.partner_id).filter((id) => id != null && !walkInIds.has(id)));

  const customers = partners
    .filter((p) => !walkInIds.has(p.id) && p.employee !== "t" && (usedBy.has(p.id) || points.has(p.id) || num(p.customer_rank) > 0))
    .map((p) => ({
      odoo_id: Number(p.id), name: nul(p.name) ?? `Customer ${p.id}`,
      email: nul(p.email) ?? nul(p.email_normalized), phone: nul(p.mobile) ?? nul(p.phone),
      street: nul([p.street, p.street2].filter(Boolean).join(", ")), zip: nul(p.zip), city: nul(p.city), vat: nul(p.vat),
      points: Math.round((points.get(p.id) ?? 0) * 100) / 100, active: p.active !== "f",
    }));
  const customerIds = new Set(customers.map((c) => c.odoo_id));

  const sales = soldOrders.map((o) => ({
    odoo_id: Number(o.id), number: nul(o.name) ?? `Order ${o.id}`, reference: nul(o.pos_reference),
    location: locationCode(configs.get(o.config_id)), customer: customerIds.has(Number(o.partner_id)) ? Number(o.partner_id) : null,
    cashier: nul(o.cashier), sold_at: o.date_order, total: num(o.amount_total), tax: num(o.amount_tax),
  }));
  const saleIds = new Set(sales.map((s) => s.odoo_id));

  const saleLines = lines
    .filter((l) => saleIds.has(Number(l.order_id)))
    .map((l) => ({
      order: Number(l.order_id), sku: skuByProduct.get(l.product_id) ?? null,
      name: name(l.full_product_name) ?? name(l.name) ?? "(no name)",
      qty: num(l.qty), unit_price: num(l.price_unit), discount: num(l.discount), total: num(l.price_subtotal_incl),
      cost: l.total_cost == null || l.total_cost === "" ? null : num(l.total_cost),
    }));

  const salePayments = payments
    // Change given back is a negative payment row: keep it, so a sale's payments add up to its total.
    .filter((p) => saleIds.has(Number(p.pos_order_id)))
    .map((p) => ({ order: Number(p.pos_order_id), method: paymentKind(methods.get(p.payment_method_id)), amount: num(p.amount), paid_at: p.payment_date ?? null }));

  const stats = {
    customers: customers.length,
    sales: sales.length,
    skippedOrders: orders.length - soldOrders.length,
    lines: saleLines.length,
    payments: salePayments.length,
    paymentsTotal: Math.round(salePayments.reduce((n, p) => n + p.amount, 0) * 100) / 100,
    revenue: Math.round(sales.reduce((n, s) => n + s.total, 0) * 100) / 100,
    linesRevenue: Math.round(saleLines.reduce((n, l) => n + l.total, 0) * 100) / 100,
    walkInSales: sales.filter((s) => s.customer === null).length,
    unknownShop: sales.filter((s) => s.location === null).length,
    duplicateEmails: customers.length - new Set(customers.map((c) => c.email?.toLowerCase()).filter(Boolean)).size - customers.filter((c) => !c.email).length,
  };

  await db.query("BEGIN");
  try {
    const live = await db.query("SELECT 1 FROM sales WHERE source = 'till' LIMIT 1");
    if (live.rowCount) throw new Error("fourshub already has sales rung up at the till. Importing the Odoo history again would delete them, so it is blocked.");
    await db.query("TRUNCATE loyalty_moves, sale_payments, sale_lines, sales, customers RESTART IDENTITY");

    await db.query(
      `INSERT INTO customers (name, email, phone, street, zip, city, vat, points, active, odoo_id)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[], $9::bool[], $10::int[])`,
      [customers.map((c) => c.name), customers.map((c) => c.email), customers.map((c) => c.phone), customers.map((c) => c.street),
       customers.map((c) => c.zip), customers.map((c) => c.city), customers.map((c) => c.vat), customers.map((c) => c.points),
       customers.map((c) => c.active), customers.map((c) => c.odoo_id)]);

    await db.query(
      `INSERT INTO sales (odoo_id, number, reference, location_id, customer_id, cashier, sold_at, total, tax)
       SELECT s.odoo_id, s.number, s.reference, l.id, c.id, s.cashier, s.sold_at::timestamp AT TIME ZONE 'UTC', s.total, s.tax
         FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::numeric[], $9::numeric[])
              AS s(odoo_id, number, reference, location, customer, cashier, sold_at, total, tax)
         LEFT JOIN locations l ON l.code = s.location
         LEFT JOIN customers c ON c.odoo_id = s.customer`,
      [sales.map((s) => s.odoo_id), sales.map((s) => s.number), sales.map((s) => s.reference), sales.map((s) => s.location),
       sales.map((s) => s.customer), sales.map((s) => s.cashier), sales.map((s) => s.sold_at), sales.map((s) => s.total), sales.map((s) => s.tax)]);

    await db.query(
      `INSERT INTO sale_lines (sale_id, sku, name, qty, unit_price, discount, total, cost)
       SELECT s.id, l.sku, l.name, l.qty, l.unit_price, l.discount, l.total, l.cost
         FROM unnest($1::int[], $2::text[], $3::text[], $4::numeric[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[])
              AS l(odoo_order, sku, name, qty, unit_price, discount, total, cost)
         JOIN sales s ON s.odoo_id = l.odoo_order`,
      [saleLines.map((l) => l.order), saleLines.map((l) => l.sku), saleLines.map((l) => l.name), saleLines.map((l) => l.qty),
       saleLines.map((l) => l.unit_price), saleLines.map((l) => l.discount), saleLines.map((l) => l.total), saleLines.map((l) => l.cost)]);

    await db.query(
      `INSERT INTO sale_payments (sale_id, method, amount, paid_at)
       SELECT s.id, p.method, p.amount, p.paid_at::timestamp AT TIME ZONE 'UTC'
         FROM unnest($1::int[], $2::text[], $3::numeric[], $4::text[]) AS p(odoo_order, method, amount, paid_at)
         JOIN sales s ON s.odoo_id = p.odoo_order`,
      [salePayments.map((p) => p.order), salePayments.map((p) => p.method), salePayments.map((p) => p.amount), salePayments.map((p) => p.paid_at)]);

    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
  return stats;
}
