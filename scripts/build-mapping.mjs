// Builds mapping/attributes.csv: every Odoo attribute value in use, and what it becomes in fourshub.
// Run once, review/edit the "becomes" column, then run the import.
//   node scripts/build-mapping.mjs <folder with Odoo TSVs>
import fs from "node:fs";
import { loadVariants } from "./lib/odoo.mjs";
import { cleanBox, cleanColour, cleanMaterial, cleanSize } from "./lib/clean.mjs";

const dir = process.argv[2] || "odoo-data/tsv";
const variants = loadVariants(dir).filter((v) => v.active);

const clean = { size: cleanSize, colour: cleanColour, material: cleanMaterial, box: cleanBox };
const rows = new Map();
for (const v of variants) {
  for (const a of v.attributes) {
    let kind = a.kind;
    if (kind === "location") kind = /^\d{2}$/.test(a.value) ? "size" : "box";
    const key = `${kind}\u0000${a.attribute}\u0000${a.value}`;
    if (!rows.has(key)) {
      const c = clean[kind]?.(a.value) ?? { value: null, note: "not used in fourshub" };
      rows.set(key, { kind, attribute: a.attribute, value: a.value, variants: 0, becomes: c.value ?? "", note: c.note ?? "" });
    }
    rows.get(key).variants++;
  }
}

const order = { size: 0, colour: 1, material: 2, other: 3, box: 4 };
const list = [...rows.values()].sort((a, b) => order[a.kind] - order[b.kind] || a.becomes.localeCompare(b.becomes) || b.variants - a.variants);
const esc = (s) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));
const csv = ["type,odoo_attribute,odoo_value,variants,becomes,note", ...list.map((r) =>
  [r.kind, r.attribute, r.value, r.variants, r.becomes, r.note].map(esc).join(","))].join("\n") + "\n";
fs.mkdirSync("mapping", { recursive: true });
fs.writeFileSync("mapping/attributes.csv", csv);

for (const kind of ["size", "colour", "material", "box", "other"]) {
  const k = list.filter((r) => r.kind === kind);
  console.log(`${kind}: ${k.length} Odoo values -> ${new Set(k.map((r) => r.becomes).filter(Boolean)).size} clean values`);
}
console.log("Wrote mapping/attributes.csv");
