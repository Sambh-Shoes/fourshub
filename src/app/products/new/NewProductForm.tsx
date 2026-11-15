"use client";

import { useActionState } from "react";
import { createProduct } from "./actions";
import { SizePicker } from "@/components/SizePicker";
import type { Location } from "@/lib/data";

export function NewProductForm({ locations, categories, canPrice, defaultLocation }: {
  locations: Location[]; categories: { id: number; name: string }[]; canPrice: boolean; defaultLocation?: number;
}) {
  const [state, action, pending] = useActionState(createProduct, null);
  const v = state?.values;
  const k = state ? JSON.stringify(state) : "new";
  return (
    <form action={action} className="card" key={k}>
      <div className="row">
        <label style={{ flex: 2, minWidth: 200 }}>Name or model number<input name="name" defaultValue={v?.name} required autoFocus /></label>
        <label>Reference (optional)<input name="reference" defaultValue={v?.reference} /></label>
        <label>Category
          <select name="category_id" defaultValue={v?.category_id ?? ""}>
            <option value="">–</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Material<input name="material" defaultValue={v?.material} placeholder="e.g. Piel" /></label>
        {canPrice && <label>Price (€, with VAT)<input name="price" defaultValue={v?.price} inputMode="decimal" style={{ width: 110 }} required /></label>}
      </div>
      <p />
      <SizePicker locations={locations} defaultLocation={defaultLocation} initial={v} />
      {state?.error && <p className="error">{state.error}</p>}
      <p><button disabled={pending}>{pending ? "Saving…" : "Create product with all sizes"}</button></p>
      <p className="muted small">Every size gets its own barcode automatically.</p>
    </form>
  );
}
