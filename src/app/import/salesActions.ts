"use server";

import { requireUser } from "@/lib/auth";
import { connectReady } from "@/lib/db";
import { readTgz } from "@/lib/tar";
// Plain JavaScript modules shared with the command line.
import { textSource } from "../../../scripts/lib/odoo.mjs";
import { runSalesImport } from "../../../scripts/lib/sales-importer.mjs";

export type SalesImportState = { error?: string; summary?: string; notes?: string[] } | null;

export async function importSales(_prev: SalesImportState, form: FormData): Promise<SalesImportState> {
  const user = await requireUser();
  if (user.role !== "admin") return { error: "Only the owner can do this." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the file first." };
  if (form.get("confirm") !== "on") return { error: "Tick the box to confirm." };

  const client = await connectReady();
  try {
    const files = readTgz(Buffer.from(await file.arrayBuffer()));
    const s = await runSalesImport(client, textSource(files));
    const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
    const notes = [
      `${s.walkInSales.toLocaleString("es-ES")} of the sales are walk-in tickets with no customer.`,
      Math.abs(s.paymentsTotal - s.revenue) >= 0.01 ? `Payments add up to ${eur(s.paymentsTotal)} against ${eur(s.revenue)} of sales: the difference is in a few tickets that were not fully paid in Odoo.` : "",
      s.unknownShop ? `${s.unknownShop} sales are from a shop fourshub does not know.` : "",
      s.duplicateEmails ? `${s.duplicateEmails} customers share an email with another customer: worth checking for duplicates.` : "",
    ].filter(Boolean);
    return {
      summary: `Loaded ${s.customers} customers and ${s.sales.toLocaleString("es-ES")} sales (${s.lines.toLocaleString("es-ES")} lines, ${s.payments.toLocaleString("es-ES")} payments), ${eur(s.revenue)} in total.`,
      notes,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The import failed." };
  } finally {
    client.release();
  }
}
