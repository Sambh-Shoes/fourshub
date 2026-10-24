import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Page } from "@/components/Nav";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ImportPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?denied=1");
  return (
    <Page user={user} active="/users">
      <h1>Load products from Odoo</h1>
      <p className="muted">Use this to fill fourshub with your Odoo products, sizes, barcodes and stock, and again with a fresh
        Odoo backup just before you switch over. Employees and working hours are not touched.</p>
      <ImportForm />
    </Page>
  );
}
