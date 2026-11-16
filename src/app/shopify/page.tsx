import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { shopifyConfig } from "@/lib/shopify";
import { Page } from "@/components/Nav";
import { CompareForm } from "./CompareForm";
import { PushForm } from "./PushForm";
import { OrdersForm } from "./OrdersForm";

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
        Compares fourshub with the online shop (www.fours.es). Comparing only reads. Sending stock is switched off until you turn it on (see below).
        Items are matched by SKU.
      </p>
      {!configured && (
        <div className="notice">
          Shopify is not connected yet. Add <code>SHOPIFY_STORE</code>, <code>SHOPIFY_CLIENT_ID</code> and{" "}
          <code>SHOPIFY_CLIENT_SECRET</code> in Vercel (Settings → Environment Variables), then redeploy.
        </div>
      )}
      <CompareForm />
      {configured && <PushForm syncOn={process.env.SHOPIFY_SYNC === "on"} />}
      {configured && <OrdersForm ordersOn={process.env.SHOPIFY_ORDERS === "on"} from={process.env.SHOPIFY_ORDERS_FROM?.trim() || null} />}
    </Page>
  );
}
