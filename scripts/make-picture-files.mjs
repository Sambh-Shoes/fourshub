// Cuts the small product pictures (Odoo's 128 px copies) out of an Odoo backup and packs them into
// parts of about 3.4 MB (the upload limit is 4 MB), named odoo-pictures-1.tgz, -2.tgz ...
// Each picture is named after its Odoo product id: 2883.jpg
// Usage: node scripts/make-picture-files.mjs <dump.sql> <backup.zip> <output folder>
// Needs a backup that includes the filestore (the "exact_fs" zip).
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";

const [dump, zip, outDir] = process.argv.slice(2);
if (!dump || !zip || !outDir) { console.error("Usage: node scripts/make-picture-files.mjs <dump.sql> <backup.zip> <output folder>"); process.exit(1); }

const found = new Map(); // template id -> { fname, ext }
let cols = null;
const rl = readline.createInterface({ input: fs.createReadStream(dump, { encoding: "utf8" }), crlfDelay: Infinity });
let inside = false;
for await (const line of rl) {
  if (!inside) {
    const m = line.match(/^COPY public\.ir_attachment \((.*)\) FROM stdin;$/);
    if (m) { cols = m[1].split(", "); inside = true; }
    continue;
  }
  if (line === "\\.") break;
  const c = line.split("\t");
  const get = (n) => c[cols.indexOf(n)];
  if (get("res_model") !== "product.template" || get("res_field") !== "image_128" || !get("store_fname") || get("store_fname") === "\\N") continue;
  const mime = get("mimetype");
  found.set(Number(get("res_id")), { fname: get("store_fname"), ext: mime === "image/png" ? "png" : "jpg" });
}
console.log(`${found.size} products have a picture in this backup`);

const work = path.join(outDir, "_work");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
const names = [...found.values()].map((v) => `filestore/${v.fname}`);
for (let i = 0; i < names.length; i += 300) {
  const r = spawnSync("unzip", ["-q", "-o", zip, "-d", work, ...names.slice(i, i + 300)], { maxBuffer: 1 << 28 });
  if (r.status !== 0 && r.status !== 11) throw new Error(`unzip failed: ${r.stderr}`); // 11 = some name not found
}

const env = { ...process.env, COPYFILE_DISABLE: "1" };
const flat = path.join(outDir, "_flat");
fs.mkdirSync(flat);
let missing = 0, part = 1, size = 0, count = 0;
let dir = path.join(outDir, `part-${part}`);
fs.mkdirSync(dir);
const flush = () => {
  if (count === 0) return;
  const out = path.join(outDir, `odoo-pictures-${part}.tgz`);
  let r = spawnSync("tar", ["--no-mac-metadata", "--no-xattrs", "-czf", out, "-C", dir, "."], { env });
  if (r.status !== 0) r = spawnSync("tar", ["-czf", out, "-C", dir, "."], { env });
  if (r.status !== 0) throw new Error(`tar failed: ${r.stderr}`);
  console.log(`${out}: ${count} pictures, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB`);
  part++; size = 0; count = 0; dir = path.join(outDir, `part-${part}`); fs.mkdirSync(dir);
};
for (const [id, v] of found) {
  const file = path.join(work, "filestore", v.fname);
  if (!fs.existsSync(file)) { missing++; continue; }
  const bytes = fs.statSync(file).size;
  if (size + bytes > 3_300_000) flush();
  fs.copyFileSync(file, path.join(dir, `${id}.${v.ext}`));
  size += bytes; count++;
}
flush();
console.log(missing ? `${missing} pictures were not in the filestore` : "all pictures found");
