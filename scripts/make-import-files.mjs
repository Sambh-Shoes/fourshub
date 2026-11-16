// Cuts the tables fourshub needs out of an Odoo backup's dump.sql and packs them into two small .tgz files:
//   odoo-products.tgz   products, sizes, barcodes and stock   -> the "Load products from Odoo" form
//   odoo-sales.tgz      customers, loyalty points and sales   -> the "Customers and sales" form
// Usage: node scripts/make-import-files.mjs <dump.sql> <output folder>
// The files hold customer data: never commit them (they are ignored by git).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const PRODUCTS = {
  product_template: null, product_product: null, product_attribute: null, product_attribute_value: null,
  product_template_attribute_value: null, product_variant_combination: null, product_category: null, stock_quant: null,
}; // null = every column

const SALES = {
  res_partner: ["id", "name", "email", "email_normalized", "phone", "mobile", "street", "street2", "zip", "city", "vat", "active", "employee", "customer_rank"],
  pos_order: ["id", "partner_id", "config_id", "name", "pos_reference", "state", "amount_total", "amount_tax", "date_order", "cashier"],
  pos_order_line: ["id", "order_id", "product_id", "full_product_name", "name", "qty", "price_unit", "discount", "price_subtotal_incl", "total_cost"],
  pos_payment: ["id", "pos_order_id", "payment_method_id", "amount", "payment_date", "is_change"],
  pos_payment_method: ["id", "name"],
  pos_config: ["id", "name"],
  product_product: ["id", "default_code"],
  loyalty_program: ["id", "program_type"],
  loyalty_card: ["id", "program_id", "partner_id", "points"],
};

const [dump, outDir] = process.argv.slice(2);
if (!dump || !outDir) {
  console.error("Usage: node scripts/make-import-files.mjs <dump.sql> <output folder>");
  process.exit(1);
}

const wanted = { ...PRODUCTS, ...Object.fromEntries(Object.entries(SALES).map(([t, c]) => [t, c])) };
const dirs = { products: path.join(outDir, "products"), sales: path.join(outDir, "sales") };
for (const d of Object.values(dirs)) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

const outs = []; // [{ file, fd }]
const written = {};
let current = null;

const rl = readline.createInterface({ input: fs.createReadStream(dump, { encoding: "utf8" }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!current) {
    const m = line.match(/^COPY public\.([a-z_0-9]+) \((.*)\) FROM stdin;$/);
    if (!m || !(m[1] in wanted) && !(m[1] in SALES)) continue;
    const table = m[1];
    const cols = m[2].split(", ");
    const targets = [];
    if (table in PRODUCTS) targets.push({ dir: dirs.products, keep: cols.map((_, i) => i) });
    if (table in SALES) {
      const want = SALES[table];
      const idx = want.map((c) => cols.indexOf(c));
      if (idx.includes(-1)) throw new Error(`${table} has no column ${want[idx.indexOf(-1)]}`);
      targets.push({ dir: dirs.sales, keep: idx, names: want });
    }
    current = targets.map((t) => {
      const fd = fs.openSync(path.join(t.dir, `${table}.tsv`), "w");
      fs.writeSync(fd, (t.names ?? cols).join("\t") + "\n");
      outs.push(fd);
      return { ...t, fd };
    });
    current.table = table;
    written[table] = 0;
    continue;
  }
  if (line === "\\.") { current = null; continue; }
  const cells = line.split("\t");
  for (const t of current) fs.writeSync(t.fd, t.keep.map((i) => cells[i]).join("\t") + "\n");
  written[current.table]++;
}
for (const fd of outs) fs.closeSync(fd);

function pack(dir, out) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsv")).sort();
  const env = { ...process.env, COPYFILE_DISABLE: "1" }; // no hidden ._ files from macOS
  let r = spawnSync("tar", ["--no-mac-metadata", "--no-xattrs", "-czf", out, ...files], { cwd: dir, env });
  if (r.status !== 0) r = spawnSync("tar", ["-czf", out, ...files], { cwd: dir, env });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  return files.length;
}

const productsTgz = path.join(outDir, "odoo-products.tgz");
const salesTgz = path.join(outDir, "odoo-sales.tgz");
console.log(`${productsTgz}: ${pack(dirs.products, productsTgz)} tables, ${(fs.statSync(productsTgz).size / 1e6).toFixed(1)} MB`);
console.log(`${salesTgz}: ${pack(dirs.sales, salesTgz)} tables, ${(fs.statSync(salesTgz).size / 1e6).toFixed(1)} MB`);
console.log("rows:", Object.entries(written).map(([t, n]) => `${t} ${n}`).join(", "));
