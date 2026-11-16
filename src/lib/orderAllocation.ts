// Decides which location an online order's pairs come out of. Pure logic: no database, no network.
//
// Rule (owner decision): the warehouse first, then the shop with the most pairs of that item.
// Stock never goes below zero: pairs that no location has are recorded as "missing" so someone can check.

export type Stock = Record<string, number>; // location code -> pairs
export type Taken = [string, number][]; // in the order the pairs were taken

export const WAREHOUSE_CODE = "ALM";

export type OrderLineState = {
  lineId: string;
  sku: string;
  desired: number; // pairs the order needs now (0 when cancelled or fully refunded)
  appliedTaken: Taken; // what was taken from stock for this line so far
  appliedMissing: number; // pairs that could not be taken so far
};

export type LineChange = {
  lineId: string;
  sku: string;
  take: Taken; // pairs to take now
  putBack: Taken; // pairs to return to stock now
  missing: number; // total pairs still not found in stock after this change
  taken: Taken; // the line's total taken after this change
};

const sum = (t: Taken) => t.reduce((n, [, v]) => n + v, 0);

/** Warehouse first, then shops by most pairs (ties by code, so the result is always the same). */
export function pickOrder(stock: Stock): string[] {
  const shops = Object.keys(stock).filter((c) => c !== WAREHOUSE_CODE).sort((a, b) => (stock[b] ?? 0) - (stock[a] ?? 0) || a.localeCompare(b));
  return [WAREHOUSE_CODE, ...shops];
}

function addTaken(taken: Taken, code: string, n: number) {
  const hit = taken.find(([c]) => c === code);
  if (hit) hit[1] += n;
  else taken.push([code, n]);
}

/**
 * Works out the stock changes for one order line. `stock` is the current stock of that item and is updated
 * in place, so two lines of the same item in one run see each other's changes.
 */
export function planLine(line: OrderLineState, stock: Stock): LineChange {
  const taken: Taken = line.appliedTaken.map(([c, n]) => [c, n]);
  const have = sum(taken) + line.appliedMissing; // pairs this line has claimed so far
  const take: Taken = [];
  const putBack: Taken = [];
  let missing = line.appliedMissing;

  if (line.desired > have) {
    let need = line.desired - have;
    for (const code of pickOrder(stock)) {
      if (need <= 0) break;
      const avail = Math.max(0, stock[code] ?? 0);
      const n = Math.min(avail, need);
      if (n > 0) {
        stock[code] = avail - n;
        addTaken(take, code, n);
        addTaken(taken, code, n);
        need -= n;
      }
    }
    missing += need; // nothing left anywhere for the rest
  } else if (line.desired < have) {
    let give = have - line.desired;
    const cut = Math.min(missing, give); // pairs that were never taken are simply forgotten
    missing -= cut;
    give -= cut;
    for (let i = taken.length - 1; i >= 0 && give > 0; i--) { // last taken is first returned
      const n = Math.min(taken[i][1], give);
      if (n > 0) {
        taken[i][1] -= n;
        stock[taken[i][0]] = (stock[taken[i][0]] ?? 0) + n;
        addTaken(putBack, taken[i][0], n);
        give -= n;
      }
    }
  }
  return { lineId: line.lineId, sku: line.sku, take, putBack, missing, taken: taken.filter(([, n]) => n > 0) };
}
