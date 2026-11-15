import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getCategories, getLocations } from "@/lib/data";
import { can } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { NewProductForm } from "./NewProductForm";

export const dynamic = "force-dynamic";

export default async function NewProduct() {
  const user = await requireUser("products.edit");
  const [locations, categories] = await Promise.all([getLocations(), getCategories()]);
  return (
    <Page user={user} active="/products">
      <p className="small"><Link href="/products">← All products</Link></p>
      <h1>New product</h1>
      <NewProductForm locations={locations} categories={categories} canPrice={can(user, "prices.edit")}
        defaultLocation={user.location_id ?? undefined} />
    </Page>
  );
}
