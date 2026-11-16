import { requireUser } from "@/lib/auth";
import { getLocations } from "@/lib/data";
import { Page } from "@/components/Nav";
import { getT } from "@/lib/lang";
import { NewTransferForm } from "./NewTransferForm";

export const dynamic = "force-dynamic";

export default async function NewTransfer() {
  const user = await requireUser("transfers.create");
  const t = await getT();
  const locations = await getLocations();
  return (
    <Page user={user} active="/transfers">
      <h1>{t("Send shoes to another shop")}</h1>
      <NewTransferForm locations={locations} defaultFrom={user.location_id ?? undefined} />
    </Page>
  );
}
