"use client";

import { useActionState } from "react";
import { addSizes } from "../new/actions";
import { SizePicker } from "@/components/SizePicker";
import type { Location } from "@/lib/data";
import { useT } from "@/components/LangProvider";

export function AddSizesForm({ productId, locations, colours }: { productId: number; locations: Location[]; colours: string }) {
  const [state, action, pending] = useActionState(addSizes.bind(null, productId), null);
  const t = useT();
  return (
    <form action={action} className="card" key={state ? JSON.stringify(state) : "add"}>
      <h2 style={{ marginTop: 0 }}>{t("Add sizes or a colour")}</h2>
      <p className="muted small">{t("Sizes that already exist are skipped. New ones get their own barcode.")}</p>
      <SizePicker locations={locations} initial={state?.values ?? { colours }} />
      {state?.error && <p className="error">{t(state.error)}</p>}
      <p><button disabled={pending}>{t("Add sizes")}</button></p>
    </form>
  );
}
