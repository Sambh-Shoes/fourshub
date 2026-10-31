// Loads products, sizes, barcodes and stock from Odoo tables into fourshub.
// Used by the command line (scripts/import-odoo.mjs) and by the upload page in the app.
// Everything is worked out in memory first, then written with a handful of bulk inserts,
// so it is fast even on a database far away.
import { loadVariants, tr } from "./odoo.mjs";

// Odoo stock.location id -> fourshub location code (checked against the POS shop settings).
export const LOCATION_MAP = { 8: "ALM", 17: "GRA", 18: "JAU", 19: "PLA" };

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const titleCase = (s) => s.split(" / ").map((p) => p.trim().charAt(0).toUpperCase() + p.trim().slice(1)).join(" / ");

/**
 * @param db        a connected pg client (not inside a transaction)
 * @param source    (tableName) => rows, see lib/odoo.mjs
 * @param mappingCsv contents of mapping/attributes.csv
 * @param replace   wipe products, stock and transfers first
 */
export async function runImport(db, source, mappingCsv, { replace = false } = {}) {
  const mapping = new Map();
  for (const [kind, attribute, value, , becomes] of parseCsv(mappingCsv).slice(1)) {
    mapping.set(`${attribute}\u0000${value}`, { kind, becomes: becomes?.trim() || null });
  }

  // ---- read Odoo ----
  const templates = new Map(source("product_template").map((t) => [Number(t.id), t]));
  const categoriesOdoo = source("product_category");
  const allVariants = loadVariants(source);

  const stockByVariant = new Map(); // odoo variant id -> {code: qty}
  for (const q of source("stock_quant")) {
    const code = LOCATION_MAP[q.location_id];
    if (!code) continue;
    const id = Number(q.product_id);
    const m = stockByVariant.get(id) ?? {};
    m[code] = (m[code] ?? 0) + Number(q.quantity);
    stockByVariant.set(id, m);
  }
  const hasStock = (id) => Object.values(stockByVariant.get(id) ?? {}).some((n) => n > 0);

  // Keep variants that are active or still have pairs somewhere; skip services (discounts, gift cards...).
  const variants = allVariants.filter((v) => {
    const t = templates.get(v.templateId);
    return t && t.detailed_type !== "service" && (v.active || hasStock(v.id));
  });

  const clean = (v) => {
    const out = { size: null, colour: null, material: null, box: null };
    for (const a of v.attributes) {
      const m = mapping.get(`${a.attribute}\u0000${a.value}`);
      if (!m || !m.becomes || !(m.kind in out)) continue;
      if (!out[m.kind]) out[m.kind] = m.becomes;
    }
    return out;
  };

  // ---- work everything out in memory ----
  const byTemplate = new Map();
  for (const v of variants) {
    if (!byTemplate.has(v.templateId)) byTemplate.set(v.templateId, []);
    byTemplate.get(v.templateId).push({ ...v, ...clean(v) });
  }

  const products = [];   // {odoo_id, name, reference, categ, material, price, active}
  const variantRows = []; // {odoo_id, template, size, colour, barcode, active}
  const aliases = [];     // {barcode, odoo_id of main variant}
  const stockRows = [];   // {odoo_id of variant, code, qty, box}
  const seenBarcodes = new Set();
  const stats = { products: 0, variants: 0, merged: 0, duplicateBarcodes: 0, boxes: 0, negative: 0, pairs: {} };

  for (const [tid, vs] of byTemplate) {
    const t = templates.get(tid);
    const count = new Map();
    for (const v of vs) if (v.material) count.set(v.material, (count.get(v.material) ?? 0) + 1);
    const material = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const box = vs.map((v) => v.box).find(Boolean) ?? (t.x_studio_box_code?.trim() || null);
    products.push({
      odoo_id: tid, name: tr(t.name)?.trim() || `Odoo ${tid}`, reference: t.default_code?.trim() || null,
      categ: Number(t.categ_id) || null, material, price: Number(t.list_price) || 0,
      active: t.active === "t" && vs.some((v) => v.active),
    });

    // Same size + colour twice in one product (Odoo duplicates, usually because of box variants): merge them.
    const groups = new Map();
    for (const v of vs) {
      const key = `${v.size ?? ""}\u0000${v.colour ?? ""}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(v);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
      const main = group[0];
      let barcode = main.barcode;
      if (barcode && seenBarcodes.has(barcode)) { barcode = null; stats.duplicateBarcodes++; }
      if (barcode) seenBarcodes.add(barcode);
      variantRows.push({ odoo_id: main.id, template: tid, size: main.size, colour: main.colour, barcode, active: group.some((v) => v.active) });
      for (const extra of group.slice(1)) {
        stats.merged++;
        if (extra.barcode && !seenBarcodes.has(extra.barcode)) {
          seenBarcodes.add(extra.barcode);
          aliases.push({ barcode: extra.barcode, variant: main.id });
        }
      }

      const qty = {};
      for (const v of group) for (const [code, n] of Object.entries(stockByVariant.get(v.id) ?? {})) qty[code] = (qty[code] ?? 0) + n;
      if (box && !("ALM" in qty)) qty.ALM = 0; // keep the box number even when the warehouse has none right now
      for (const [code, n] of Object.entries(qty)) {
        let pairs = Math.round(n);
        if (pairs < 0) { stats.negative++; pairs = 0; }
        const rowBox = code === "ALM" ? box : null;
        if (pairs === 0 && !rowBox) continue;
        if (rowBox) stats.boxes++;
        stats.pairs[code] = (stats.pairs[code] ?? 0) + pairs;
        stockRows.push({ variant: main.id, code, qty: pairs, box: rowBox });
      }
    }
  }
  stats.products = products.length;
  stats.variants = variantRows.length;

  // ---- write ----
  await db.query("BEGIN");
  try {
    const existing = (await db.query("SELECT count(*)::int AS n FROM products")).rows[0].n;
    if (existing && !replace) throw new Error(`There are already ${existing} products. Use "replace" to wipe and reload products and stock.`);
    if (replace) {
      await db.query("TRUNCATE transfer_lines, transfers, stock_moves, stock, barcode_aliases, variants, products, categories RESTART IDENTITY");
    }
    for (const [odooId, code] of Object.entries(LOCATION_MAP)) {
      await db.query("UPDATE locations SET odoo_id = $2 WHERE code = $1", [code, Number(odooId)]);
    }

    await db.query(
      `INSERT INTO categories (name, odoo_id) SELECT * FROM unnest($1::text[], $2::int[])`,
      [categoriesOdoo.map((c) => titleCase(c.complete_name ?? tr(c.name) ?? "")), categoriesOdoo.map((c) => Number(c.id))]);

    await db.query(
      `INSERT INTO products (name, reference, category_id, material, price, active, odoo_id)
       SELECT p.name, p.reference, c.id, p.material, p.price, p.active, p.odoo_id
         FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::numeric[], $6::bool[], $7::int[])
              AS p(name, reference, categ, material, price, active, odoo_id)
         LEFT JOIN categories c ON c.odoo_id = p.categ`,
      [products.map((p) => p.name), products.map((p) => p.reference), products.map((p) => p.categ), products.map((p) => p.material),
       products.map((p) => p.price), products.map((p) => p.active), products.map((p) => p.odoo_id)]);

    await db.query(
      `INSERT INTO variants (product_id, size, colour, barcode, active, odoo_id)
       SELECT p.id, v.size, v.colour, v.barcode, v.active, v.odoo_id
         FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::bool[], $6::int[])
              AS v(template, size, colour, barcode, active, odoo_id)
         JOIN products p ON p.odoo_id = v.template`,
      [variantRows.map((v) => v.template), variantRows.map((v) => v.size), variantRows.map((v) => v.colour),
       variantRows.map((v) => v.barcode), variantRows.map((v) => v.active), variantRows.map((v) => v.odoo_id)]);

    await db.query(
      `INSERT INTO barcode_aliases (barcode, variant_id)
       SELECT a.barcode, v.id FROM unnest($1::text[], $2::int[]) AS a(barcode, variant) JOIN variants v ON v.odoo_id = a.variant`,
      [aliases.map((a) => a.barcode), aliases.map((a) => a.variant)]);

    await db.query(
      `INSERT INTO stock (variant_id, location_id, qty, box)
       SELECT v.id, l.id, s.qty, s.box
         FROM unnest($1::int[], $2::text[], $3::int[], $4::text[]) AS s(variant, code, qty, box)
         JOIN variants v ON v.odoo_id = s.variant JOIN locations l ON l.code = s.code`,
      [stockRows.map((s) => s.variant), stockRows.map((s) => s.code), stockRows.map((s) => s.qty), stockRows.map((s) => s.box)]);

    await db.query(
      `INSERT INTO stock_moves (variant_id, to_location, qty, reason)
       SELECT variant_id, location_id, qty, 'import' FROM stock WHERE qty > 0`);
    await db.query("COMMIT");
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
  return stats;
}
