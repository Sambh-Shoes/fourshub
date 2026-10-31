"use client";

import { useActionState } from "react";
import { addSizes } from "../new/actions";
import { SizePicker } from "@/components/SizePicker";
import type { Location } from "@/lib/data";

export function AddSizesForm({ productId, locations, colours }: { productId: number; locations: Location[]; colours: string }) {
  const [state, action, pending] = useActionState(addSizes.bind(null, productId), null);
  return (
    <form action={action} className="card" key={state ? JSON.stringify(state) : "add"}>
      <h2 style={{ marginTop: 0 }}>Add sizes or a colour</h2>
      <p className="muted small">Sizes that already exist are skipped. New ones get their own barcode.</p>
      <SizePicker locations={locations} initial={state?.values ?? { colours }} />
      {state?.error && <p className="error">{state.error}</p>}
      <p><button disabled={pending}>Add sizes</button></p>
    </form>
  );
}
