// Reads tables exported from the Odoo backup (one TSV per table, PostgreSQL COPY text format,
// first line = column names). See README "Loading data from Odoo".
import fs from "node:fs";
import path from "node:path";

function unescape(v) {
  if (v === "\\N") return null;
  return v.replace(/\\(.)/g, (_, c) => ({ t: "\t", n: "\n", r: "\r", "\\": "\\" })[c] ?? c);
}

export function parseTable(text) {
  const lines = text.split("\n");
  const cols = lines[0].split("\t");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = lines[i].split("\t");
    const row = {};
    cols.forEach((c, j) => (row[c] = unescape(cells[j] ?? "\\N")));
    rows.push(row);
  }
  return rows;
}

/** A "source" gives the rows of one Odoo table by name. */
export function dirSource(dir) {
  return (name) => parseTable(fs.readFileSync(path.join(dir, `${name}.tsv`), "utf8"));
}

/** Source from file contents already in memory: { "product_product.tsv": "...", ... } */
export function textSource(files) {
  return (name) => {
    const key = Object.keys(files).find((k) => k.endsWith(`${name}.tsv`));
    if (!key) throw new Error(`The file has no ${name} table.`);
    return parseTable(files[key]);
  };
}

/** Odoo stores translatable names as JSON: {"en_US": "...", "es_ES": "..."} */
export function tr(v) {
  if (!v) return null;
  try {
    const o = JSON.parse(v);
    return o.es_ES ?? o.en_US ?? Object.values(o)[0] ?? null;
  } catch {
    return v;
  }
}

// Which Odoo attribute names mean what. Odoo has ~100 attributes, many of them typos.
export function attributeKind(name) {
  const n = name.toLowerCase().trim();
  if (/(si[zx]e|siez|talla)/.test(n)) return "size";
  if (/colo/.test(n)) return "colour";
  if (/(mat|piel)/.test(n)) return "material";
  if (/(box|b.x|boc|^b`$)/.test(n)) return "box";
  if (n === "location") return "location";
  return "other";
}

/**
 * Loads every Odoo variant with its attribute values, already sorted into
 * size / colour / material / box / other.
 */
export function loadVariants(source) {
  const attrs = new Map(source("product_attribute").map((a) => [a.id, tr(a.name)]));
  const values = new Map(
    source("product_attribute_value").map((v) => [v.id, { attribute: attrs.get(v.attribute_id) ?? "?", value: tr(v.name) }]),
  );
  const ptav = new Map(source("product_template_attribute_value").map((t) => [t.id, values.get(t.product_attribute_value_id)]));
  const combos = new Map();
  for (const c of source("product_variant_combination")) {
    const v = ptav.get(c.product_template_attribute_value_id);
    if (!v) continue;
    if (!combos.has(c.product_product_id)) combos.set(c.product_product_id, []);
    combos.get(c.product_product_id).push(v);
  }
  return source("product_product").map((p) => ({
    id: Number(p.id),
    templateId: Number(p.product_tmpl_id),
    barcode: p.barcode?.trim() || null,
    active: p.active === "t",
    attributes: (combos.get(p.id) ?? []).map((a) => ({ ...a, kind: attributeKind(a.attribute) })),
  }));
}
