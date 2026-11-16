"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QUICK_DISCOUNTS, STAFF_MAX_DISCOUNT, euroText, priceCart, settle } from "@/lib/till";
import { thumb } from "@/lib/images";
import type { Receipt } from "@/lib/receipt";
import { completeSale, createCustomer, findCustomers, searchItems, type CustomerHit, type ItemHit } from "./actions";
import { ReceiptView } from "./Receipt";

type Line = { item: ItemHit; qty: number; discount: number };
type Loc = { id: number; name: string };

const newRef = () => crypto.randomUUID();
/** "12,5" or "12.50" typed by staff, in euros -> cents; empty is 0. */
const cents = (text: string) => {
  const n = Number(text.replace(",", ".").trim());
  return text.trim() === "" ? 0 : Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
};

export function Till({ locations, defaultLocationId, canChoose, live }: { locations: Loc[]; defaultLocationId: number; canChoose: boolean; live: boolean }) {
  const [locationId, setLocationId] = useState(defaultLocationId);
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ItemHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [custQuery, setCustQuery] = useState("");
  const [custHits, setCustHits] = useState<CustomerHit[]>([]);
  const [newCust, setNewCust] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [rewards, setRewards] = useState(0);
  const [cardText, setCardText] = useState("");
  const [cashText, setCashText] = useState("");
  const [approver, setApprover] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [ref, setRef] = useState(newRef);
  const scan = useRef<HTMLInputElement>(null);

  useEffect(() => { scan.current?.focus(); }, [receipt, lines.length]);

  const pricing = useMemo(
    () => priceCart(lines.map((l) => ({ variantId: l.item.variantId, unitCents: l.item.priceCents, qty: l.qty, discount: l.discount })),
      { hasCustomer: !!customer, customerPoints: customer?.points ?? 0, rewards }),
    [lines, customer, rewards]);
  const cardCents = cents(cardText);
  const cashGiven = cents(cashText);
  const pay = Number.isNaN(cardCents) || Number.isNaN(cashGiven) ? null : settle(pricing.totalCents, { cardCents, cashGivenCents: cashGiven });

  function add(item: ItemHit) {
    setLines((cur) => {
      const i = cur.findIndex((l) => l.item.variantId === item.variantId);
      if (i >= 0) return cur.map((l, j) => (j === i ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...cur, { item, qty: 1, discount: 0 }];
    });
    setHits([]); setQuery(""); setError("");
  }

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true); setError("");
    try {
      const found = await searchItems(q, locationId);
      // A scan that matches exactly one item goes straight on the ticket.
      if (found.length === 1 && (found[0].barcode === q || /^\d{6,}$/.test(q))) add(found[0]);
      else { setHits(found); if (found.length === 0) setError("No item found."); }
    } catch { setError("Could not search. Check the connection."); }
    setSearching(false);
  }

  async function runCustomerSearch(text: string) {
    setCustQuery(text);
    if (text.trim().length < 2) { setCustHits([]); return; }
    try { setCustHits(await findCustomers(text)); } catch { /* keep typing */ }
  }

  function reset() {
    setLines([]); setCustomer(null); setCustQuery(""); setCustHits([]); setRewards(0); setCardText(""); setCashText("");
    setApprover(null); setError(""); setReceipt(null); setRef(newRef());
  }

  async function pay_() {
    if (!pay?.ok) { setError(pay?.error ?? "Check the amounts."); return; }
    setBusy(true); setError("");
    try {
      const res = await completeSale({
        ref, locationId, customerId: customer?.id ?? null, rewards: pricing.rewards,
        lines: lines.map((l) => ({ variantId: l.item.variantId, qty: l.qty, discount: l.discount })),
        cardCents: cardCents as number, cashGivenCents: cashGiven as number,
        approver: approver ?? undefined,
      });
      if (res.needsApproval) { setApprover((a) => a ?? { username: "", password: "" }); setError(res.error ?? ""); }
      else if (res.error) setError(res.error);
      else if (res.receipt) setReceipt(res.receipt);
    } catch { setError("The connection dropped. Press Pay again: the ticket will not be sold twice."); }
    setBusy(false);
  }

  if (receipt) {
    return (
      <div className="till-done">
        <div className="no-print">
          {receipt.practice && <div className="notice">Practice mode: nothing was saved, stock and sales did not change.</div>}
          {receipt.warnings.map((w) => <div className="notice" key={w}>{w}</div>)}
          <p className="row">
            <button onClick={() => window.print()}>Print ticket</button>
            <button className="secondary" onClick={reset}>New sale</button>
          </p>
          {receipt.changeCents > 0 && <p className="till-change">Change: {euroText(receipt.changeCents)}</p>}
        </div>
        <ReceiptView r={receipt} />
      </div>
    );
  }

  const shopName = locations.find((l) => l.id === locationId)?.name ?? "";
  return (
    <div className="till">
      {!live && <div className="notice">Practice mode: you can ring up and print tickets, but nothing is saved and stock does not change.</div>}

      <div className="till-main">
        <section className="card">
          <div className="row">
            <label style={{ flex: 1 }}>Scan a barcode, or type a name or reference
              <input ref={scan} value={query} autoComplete="off" onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }} />
            </label>
            <button onClick={runSearch} disabled={searching}>{searching ? "…" : "Find"}</button>
            {canChoose && locations.length > 1 && (
              <label>Shop
                <select value={locationId} onChange={(e) => { setLocationId(Number(e.target.value)); setLines([]); setHits([]); }}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
          {hits.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 12 }}><table>
              <thead><tr><th>Item</th><th>Colour</th><th>Size</th><th className="num">Price</th><th className="num">In {shopName}</th><th /></tr></thead>
              <tbody>{hits.map((h) => (
                <tr key={h.variantId}>
                  <td><div className="till-item">{h.image && <img className="thumb" src={thumb(h.image)!} alt="" loading="lazy" />}<div>{h.name}{h.reference && <div className="muted small">{h.reference}</div>}</div></div></td><td>{h.colour}</td><td>{h.size}</td>
                  <td className="num">{euroText(h.priceCents)}</td>
                  <td className="num">{h.here > 0 ? h.here : <span className="badge warn">0</span>}{h.here === 0 && h.elsewhere > 0 && <div className="muted small">{h.elsewhere} elsewhere</div>}</td>
                  <td><button onClick={() => add(h)}>Add</button></td>
                </tr>))}</tbody>
            </table></div>
          )}
        </section>

        <section className="card">
          <h2>Ticket</h2>
          {lines.length === 0 ? <p className="muted">Scan the first pair.</p> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Item</th><th>Qty</th><th>Discount</th><th className="num">Price</th><th /></tr></thead>
              <tbody>{pricing.lines.map((p, i) => {
                const l = lines[i];
                return (
                  <tr key={l.item.variantId}>
                    <td><div className="till-item">{l.item.image && <img className="thumb" src={thumb(l.item.image)!} alt="" />}<div>{l.item.name}<div className="muted small">{[l.item.colour, l.item.size].filter(Boolean).join(" · ")} {l.item.here === 0 && <span className="badge warn">system shows 0 here</span>}</div></div></div></td>
                    <td>
                      <button className="secondary" onClick={() => setLines((c) => c.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                      <span style={{ margin: "0 8px" }}>{l.qty}</span>
                      <button className="secondary" onClick={() => setLines((c) => c.map((x, j) => (j === i ? { ...x, qty: Math.min(20, x.qty + 1) } : x)))}>+</button>
                    </td>
                    <td>
                      <select value={l.discount} onChange={(e) => setLines((c) => c.map((x, j) => (j === i ? { ...x, discount: Number(e.target.value) } : x)))}>
                        <option value={0}>none</option>
                        {QUICK_DISCOUNTS.map((d) => <option key={d} value={d}>{d}%{d > STAFF_MAX_DISCOUNT ? " (manager)" : ""}</option>)}
                      </select>
                    </td>
                    <td className="num">{p.savedCents > 0 && <div className="muted small"><s>{euroText(p.listCents)}</s></div>}{euroText(p.lineCents)}</td>
                    <td><button className="secondary" onClick={() => setLines((c) => c.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>);
              })}</tbody>
            </table></div>
          )}
        </section>
      </div>

      <aside className="till-side">
        <section className="card">
          <h2>Customer <span className="muted small">(optional)</span></h2>
          {customer ? (
            <p>
              <strong>{customer.name}</strong><br /><span className="muted small">{customer.phone ?? customer.email}</span><br />
              {customer.points.toLocaleString("es-ES")} points{" "}
              <button className="secondary" onClick={() => { setCustomer(null); setRewards(0); }}>Change</button>
            </p>
          ) : newCust ? (
            <div className="till-new">
              <input placeholder="Name" value={newCust.name} onChange={(e) => setNewCust({ ...newCust, name: e.target.value })} />
              <input placeholder="Phone" value={newCust.phone} onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })} />
              <input placeholder="Email" value={newCust.email} onChange={(e) => setNewCust({ ...newCust, email: e.target.value })} />
              <button onClick={async () => {
                const r = await createCustomer(newCust.name, newCust.phone, newCust.email);
                if ("error" in r) setError(r.error); else { setCustomer(r); setNewCust(null); setError(""); }
              }}>Save customer</button>{" "}
              <button className="secondary" onClick={() => setNewCust(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <input placeholder="Name, email or phone" value={custQuery} onChange={(e) => runCustomerSearch(e.target.value)} />
              {custHits.map((c) => (
                <div key={c.id}><button className="secondary" style={{ width: "100%", textAlign: "left", marginTop: 6 }} onClick={() => { setCustomer(c); setCustHits([]); setCustQuery(""); }}>
                  {c.name} <span className="muted small">{c.phone ?? c.email} · {c.points} pts</span></button></div>
              ))}
              <p><button className="secondary" onClick={() => setNewCust({ name: "", phone: "", email: "" })}>New customer</button></p>
            </>
          )}
          {customer && pricing.maxRewards > 0 && (
            <label>Loyalty reward (100 points = €10 off)
              <select value={pricing.rewards} onChange={(e) => setRewards(Number(e.target.value))}>
                {Array.from({ length: pricing.maxRewards + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "don't use" : `use ${n} (−${euroText(n * 1000)})`}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className="card">
          <div className="till-total">{euroText(pricing.totalCents)}</div>
          <p className="muted small">VAT included {euroText(pricing.vatCents)}{pricing.savedCents > 0 ? ` · discounts ${euroText(pricing.savedCents)}` : ""}{pricing.rewardCents > 0 ? ` · reward −${euroText(pricing.rewardCents)}` : ""}{customer && pricing.pointsEarned > 0 ? ` · earns ${pricing.pointsEarned.toLocaleString("es-ES")} pts` : ""}</p>

          <div className="row">
            <label style={{ flex: 1 }}>Card (€)<input inputMode="decimal" value={cardText} onChange={(e) => setCardText(e.target.value)} /></label>
            <label style={{ flex: 1 }}>Cash given (€)<input inputMode="decimal" value={cashText} onChange={(e) => setCashText(e.target.value)} /></label>
          </div>
          <p className="row">
            <button className="secondary" onClick={() => { setCardText((pricing.totalCents / 100).toFixed(2).replace(".", ",")); setCashText(""); }}>All by card</button>
            <button className="secondary" onClick={() => { setCashText((pricing.totalCents / 100).toFixed(2).replace(".", ",")); setCardText(""); }}>Exact cash</button>
          </p>
          {pay?.ok && pay.changeCents > 0 && <p className="till-change">Change: {euroText(pay.changeCents)}</p>}
          {pay && !pay.ok && pricing.totalCents > 0 && (cardText || cashText) && <p className="muted small">{pay.error}</p>}

          {approver && (
            <div className="notice">
              A discount above {STAFF_MAX_DISCOUNT}% needs a manager. The manager signs in here:
              <input placeholder="Manager username" value={approver.username} onChange={(e) => setApprover({ ...approver, username: e.target.value })} />
              <input type="password" placeholder="Manager password" value={approver.password} onChange={(e) => setApprover({ ...approver, password: e.target.value })} />
            </div>
          )}
          {error && <p className="error">{error}</p>}
          <button className="till-pay" disabled={busy || lines.length === 0 || !pay?.ok} onClick={pay_}>{busy ? "Saving…" : "Pay"}</button>
          {lines.length > 0 && <p><button className="secondary" onClick={reset}>Cancel ticket</button></p>}
        </section>
      </aside>
    </div>
  );
}
