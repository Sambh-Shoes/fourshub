// Loads products, sizes, barcodes and stock from an Odoo backup export into fourshub.
//   node scripts/import-odoo.mjs <folder with Odoo TSVs> [--replace]
// Uses mapping/attributes.csv (see build-mapping.mjs) to turn Odoo's messy attributes into
// one Size, one Colour, one Material and a box number.
import fs from "node:fs";
import { connect } from "./env.mjs";
import { loadVariants, readTable, tr } from "./lib/odoo.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) || "odoo-data/tsv";
const replace = args.includes("--replace");

// Odoo stock.location id -> fourshub location code (checked against the POS shop settings).
const LOCATION_MAP = { 8: "ALM", 17: "GRA", 18: "JAU", 19: "PLA" };

// ---- mapping ----
function parseCsv(text) {
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
const mapping = new Map();
for (const [kind, attribute, value, , becomes] of parseCsv(fs.readFileSync("mapping/attributes.csv", "utf8")).slice(1)) {
  mapping.set(`${attribute}\u0000${value}`, { kind, becomes: becomes.trim() || null });
}

// ---- read Odoo ----
const templates = new Map(readTable(dir, "product_template").map((t) => [Number(t.id), t]));
const categoriesOdoo = readTable(dir, "product_category");
const allVariants = loadVariants(dir);

const stockByVariant = new Map(); // odoo variant id -> {code: qty}
const report = { negative: 0, unknownLocation: 0 };
for (const q of readTable(dir, "stock_quant")) {
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

function clean(v) {
  const out = { size: null, colour: null, material: null, box: null };
  for (const a of v.attributes) {
    const m = mapping.get(`${a.attribute}\u0000${a.value}`);
    if (!m || !m.becomes || !(m.kind in out)) continue;
    if (!out[m.kind]) out[m.kind] = m.becomes;
  }
  return out;
}

// ---- write ----
const db = connect();
await db.connect();
const existing = (await db.query("SELECT count(*)::int AS n FROM products")).rows[0].n;
if (existing && !replace) {
  console.error(`There are already ${existing} products. Run again with --replace to wipe and reload products and stock.`);
  process.exit(1);
}

await db.query("BEGIN");
if (replace) {
  await db.query("TRUNCATE transfer_lines, transfers, stock_moves, stock, barcode_aliases, variants, products, categories RESTART IDENTITY");
}
const loc = Object.fromEntries((await db.query("SELECT code, id FROM locations")).rows.map((r) => [r.code, r.id]));
for (const [odooId, code] of Object.entries(LOCATION_MAP)) {
  await db.query("UPDATE locations SET odoo_id = $2 WHERE code = $1", [code, Number(odooId)]);
}

const titleCase = (s) => s.split(" / ").map((p) => p.trim().charAt(0).toUpperCase() + p.trim().slice(1)).join(" / ");
const catIds = new Map();
for (const c of categoriesOdoo) {
  const r = await db.query("INSERT INTO categories (name, odoo_id) VALUES ($1, $2) RETURNING id", [titleCase(c.complete_name ?? tr(c.name)), Number(c.id)]);
  catIds.set(Number(c.id), r.rows[0].id);
}

// Group variants by template, then work out the product-level material and box.
const byTemplate = new Map();
for (const v of variants) {
  const c = clean(v);
  if (!byTemplate.has(v.templateId)) byTemplate.set(v.templateId, []);
  byTemplate.get(v.templateId).push({ ...v, ...c });
}

const seenBarcodes = new Set();
let nProducts = 0, nVariants = 0, nMerged = 0, nDupBarcodes = 0, nBoxes = 0;
const totals = {};
for (const [tid, vs] of byTemplate) {
  const t = templates.get(tid);
  const materials = vs.map((v) => v.material).filter(Boolean);
  const material = materials.sort((a, b) => materials.filter((m) => m === b).length - materials.filter((m) => m === a).length)[0] ?? null;
  const box = vs.map((v) => v.box).find(Boolean) ?? (t.x_studio_box_code?.trim() || null);
  const p = await db.query(
    `INSERT INTO products (name, reference, category_id, material, price, active, odoo_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [tr(t.name)?.trim() || `Odoo ${tid}`, t.default_code?.trim() || null, catIds.get(Number(t.categ_id)) ?? null, material,
     Number(t.list_price) || 0, t.active === "t" && vs.some((v) => v.active), tid],
  );
  nProducts++;
  const productId = p.rows[0].id;

  // Same size + colour twice in one product (Odoo duplicates, usually because of box variants): merge them.
  const bySizeColour = new Map();
  for (const v of vs) {
    const key = `${v.size ?? ""}\u0000${v.colour ?? ""}`;
    if (!bySizeColour.has(key)) bySizeColour.set(key, []);
    bySizeColour.get(key).push(v);
  }
  for (const group of bySizeColour.values()) {
    group.sort((a, b) => Number(b.active) - Number(a.active) || a.id - b.id);
    const main = group[0];
    let barcode = main.barcode;
    if (barcode && seenBarcodes.has(barcode)) { barcode = null; nDupBarcodes++; }
    if (barcode) seenBarcodes.add(barcode);
    const r = await db.query(
      `INSERT INTO variants (product_id, size, colour, barcode, active, odoo_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [productId, main.size, main.colour, barcode, group.some((v) => v.active), main.id],
    );
    nVariants++;
    const variantId = r.rows[0].id;
    for (const extra of group.slice(1)) {
      nMerged++;
      if (extra.barcode && !seenBarcodes.has(extra.barcode)) {
        seenBarcodes.add(extra.barcode);
        await db.query("INSERT INTO barcode_aliases (barcode, variant_id) VALUES ($1, $2)", [extra.barcode, variantId]);
      }
    }

    const qty = {};
    for (const v of group) for (const [code, n] of Object.entries(stockByVariant.get(v.id) ?? {})) qty[code] = (qty[code] ?? 0) + n;
    if (box && !("ALM" in qty)) qty.ALM = 0; // keep the box number even when the warehouse has none right now
    for (const [code, n] of Object.entries(qty)) {
      let pairs = Math.round(n);
      if (pairs < 0) { report.negative++; pairs = 0; }
      const rowBox = code === "ALM" ? box : null;
      if (pairs === 0 && !rowBox) continue;
      if (rowBox) nBoxes++;
      totals[code] = (totals[code] ?? 0) + pairs;
      await db.query(
        `INSERT INTO stock (variant_id, location_id, qty, box) VALUES ($1, $2, $3, $4)`,
        [variantId, loc[code], pairs, rowBox],
      );
      if (pairs > 0) {
        await db.query(`INSERT INTO stock_moves (variant_id, to_location, qty, reason) VALUES ($1, $2, $3, 'import')`, [variantId, loc[code], pairs]);
      }
    }
  }
}
await db.query("COMMIT");
await db.end();

console.log(`Products (models): ${nProducts}`);
console.log(`Sizes/variants:    ${nVariants}  (${nMerged} Odoo duplicates merged, old barcodes still scan)`);
console.log(`Barcodes used twice in Odoo, left empty: ${nDupBarcodes}`);
console.log(`Stock rows with a box number: ${nBoxes}`);
console.log(`Negative Odoo stock set to 0: ${report.negative}`);
console.log("Pairs per location:", totals);
