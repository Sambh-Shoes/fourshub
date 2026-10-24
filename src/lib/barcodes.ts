import type { PoolClient } from "pg";

// New barcodes are EAN-13 in the 200-299 "in-store" range, so they never clash with
// supplier barcodes and any scanner or label printer can read them.
function checkDigit(twelve: string) {
  const sum = [...twelve].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

export async function nextBarcodes(db: PoolClient, count: number) {
  await db.query("LOCK TABLE variants IN SHARE ROW EXCLUSIVE MODE");
  const r = await db.query<{ max: string | null }>(
    "SELECT max(substr(barcode, 4, 9)) AS max FROM variants WHERE barcode ~ '^200[0-9]{10}$'");
  let n = Number(r.rows[0].max ?? 0);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    n++;
    const twelve = "200" + String(n).padStart(9, "0");
    out.push(twelve + checkDigit(twelve));
  }
  return out;
}
