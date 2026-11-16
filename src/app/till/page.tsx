import { requireUser } from "@/lib/auth";
import { getLocations } from "@/lib/data";
import { can } from "@/lib/permissions";
import { Page } from "@/components/Nav";
import { Till } from "./Till";

export const dynamic = "force-dynamic";

export default async function TillPage() {
  const user = await requireUser("till.use");
  const shops = (await getLocations()).filter((l) => l.kind === "shop");
  const own = shops.find((l) => l.id === user.location_id);
  const first = own ?? shops[0];
  return (
    <Page user={user} active="/till">
      {first ? (
        <Till
          locations={shops.map((l) => ({ id: l.id, name: l.name }))}
          defaultLocationId={first.id}
          canChoose={!own || can(user, "discounts.high")}
          live={process.env.TILL_LIVE === "on"}
        />
      ) : <p>No shops are set up.</p>}
    </Page>
  );
}
