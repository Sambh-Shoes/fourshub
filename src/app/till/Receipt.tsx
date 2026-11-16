"use client";

import { RETURNS_TEXT, type Receipt } from "@/lib/receipt";
import { euroText } from "@/lib/till";

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

/** The ticket as it prints: narrow, plain, the same on screen and on paper. */
export function ReceiptView({ r }: { r: Receipt }) {
  const base = r.totalCents - r.vatCents;
  return (
    <div className="receipt">
      {r.practice && <p className="receipt-practice">PRACTICE: nothing was saved</p>}
      <p className="receipt-head"><strong>{r.company.name}</strong><br />
        {r.company.address && <>{r.company.address}<br /></>}
        CIF {r.company.nif}<br />{r.shop} · {r.company.web}
      </p>
      <p>Ticket {r.ticketNo}<br />{when(r.soldAt)} · {r.cashier}{r.customer ? <><br />Cliente: {r.customer.name}</> : null}</p>
      <hr />
      <table>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={i}>
              <td>{l.name}{l.detail ? <><br /><span className="receipt-sub">{l.detail}</span></> : null}
                {l.discount > 0 ? <><br /><span className="receipt-sub">{l.qty} × {euroText(l.unitCents)} −{l.discount}%</span></> : l.qty > 1 ? <><br /><span className="receipt-sub">{l.qty} × {euroText(l.unitCents)}</span></> : null}
              </td>
              <td className="num">{euroText(l.lineCents)}</td>
            </tr>
          ))}
          {r.rewardCents > 0 && <tr><td>Premio fidelidad</td><td className="num">−{euroText(r.rewardCents)}</td></tr>}
        </tbody>
      </table>
      <hr />
      <table>
        <tbody>
          <tr className="receipt-total"><td>TOTAL</td><td className="num">{euroText(r.totalCents)}</td></tr>
          <tr><td>Base imponible</td><td className="num">{euroText(base)}</td></tr>
          <tr><td>IVA 21%</td><td className="num">{euroText(r.vatCents)}</td></tr>
          {r.savedCents > 0 && <tr><td>Ahorro en descuentos</td><td className="num">{euroText(r.savedCents)}</td></tr>}
          {r.cashCents > 0 && <tr><td>Efectivo</td><td className="num">{euroText(r.givenCents)}</td></tr>}
          {r.cardCents > 0 && <tr><td>Tarjeta</td><td className="num">{euroText(r.cardCents)}</td></tr>}
          {r.changeCents > 0 && <tr><td>Cambio</td><td className="num">{euroText(r.changeCents)}</td></tr>}
        </tbody>
      </table>
      {r.customer && <p className="receipt-sub">Puntos: {r.customer.pointsBefore.toLocaleString("es-ES")} → {r.customer.pointsAfter.toLocaleString("es-ES")}</p>}
      <hr />
      <div className="receipt-sub">{RETURNS_TEXT.map((t, i) => <p key={i}>{t}</p>)}</div>
      <p className="receipt-head">¡Gracias por tu compra!</p>
    </div>
  );
}
