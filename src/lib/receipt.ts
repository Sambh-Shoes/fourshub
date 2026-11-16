// What a ticket shows. The company details and the returns text are the ones Odoo prints today.

export const COMPANY = {
  name: process.env.RECEIPT_COMPANY ?? "4 Seasons Shoes S.L.",
  nif: process.env.RECEIPT_NIF ?? "B56717432",
  address: process.env.RECEIPT_ADDRESS ?? "", // set RECEIPT_ADDRESS in Vercel to print the address under the name
  web: "fours.es",
};

export const RETURNS_TEXT = [
  "Devoluciones: se aceptan dentro de los 14 días posteriores a la compra, siempre que el producto no haya sido usado y se devuelva en su caja original, con todos sus accesorios. El reembolso se realizará en la misma forma de pago utilizada en la compra.",
  "Cambios: se permiten por otro modelo o talla, siempre que el producto esté en perfecto estado y con su empaque original.",
  "Devoluciones o cambios por calidad: serán evaluados por nuestro personal.",
  "Por razones de higiene, los calcetines no tienen cambio ni devolución.",
  "Para cualquier devolución o cambio es indispensable presentar este ticket.",
];

export type ReceiptLine = { name: string; detail: string; qty: number; unitCents: number; discount: number; lineCents: number };

export type Receipt = {
  practice: boolean; // true when nothing was saved
  company: { name: string; nif: string; address: string; web: string }; // read on the server, so Vercel settings apply
  ticketNo: string;
  soldAt: string; // ISO time
  shop: string;
  cashier: string;
  customer: { name: string; pointsBefore: number; pointsAfter: number } | null;
  lines: ReceiptLine[];
  rewardCents: number;
  savedCents: number;
  totalCents: number;
  vatCents: number;
  cashCents: number;
  cardCents: number;
  givenCents: number; // cash handed over
  changeCents: number;
  warnings: string[]; // for the staff, not printed
};
