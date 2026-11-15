import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { shopifyConfig } from "@/lib/shopify";
import { Page } from "@/components/Nav";
import { CompareForm } from "./CompareForm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function ShopifyPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/?denied=1");
  const configured = shopifyConfig() !== null;
  return (
    <Page user={user} active="/shopify">
      <h1>Shopify</h1>
      <p className="muted">
        Compares fourshub with the online shop (www.fours.es). For now this only reads: nothing is sent to Shopify.
        Items are matched by SKU.
      </p>
      {!configured && (
        <div className="notice">
          Shopify is not connected yet. Add <code>SHOPIFY_STORE</code>, <code>SHOPIFY_CLIENT_ID</code> and{" "}
          <code>SHOPIFY_CLIENT_SECRET</code> in Vercel (Settings → Environment Variables), then redeploy.
        </div>
      )}
      <CompareForm />
    </Page>
  );
}
