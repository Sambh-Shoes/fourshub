// Loads products, sizes, barcodes and stock from an Odoo backup export into fourshub.
//   node scripts/import-odoo.mjs <folder with Odoo TSVs> [--replace]
// Uses mapping/attributes.csv (see build-mapping.mjs) to turn Odoo's messy attributes into
// one Size, one Colour, one Material and a box number. The same import runs from the
// app's upload page (Employees > Import from Odoo).
import fs from "node:fs";
import { connect } from "./env.mjs";
import { dirSource } from "./lib/odoo.mjs";
import { runImport } from "./lib/importer.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--")) || "odoo-data/tsv";

const db = connect();
await db.connect();
try {
  const s = await runImport(db, dirSource(dir), fs.readFileSync("mapping/attributes.csv", "utf8"), { replace: args.includes("--replace") });
  console.log(`Products (models): ${s.products}`);
  console.log(`Sizes/variants:    ${s.variants}  (${s.merged} Odoo duplicates merged, old barcodes still scan)`);
  console.log(`Barcodes used twice in Odoo, left empty: ${s.duplicateBarcodes}`);
  console.log(`Stock rows with a box number: ${s.boxes}`);
  console.log(`Negative Odoo stock set to 0: ${s.negative}`);
  console.log("Pairs per location:", s.pairs);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await db.end();
}
