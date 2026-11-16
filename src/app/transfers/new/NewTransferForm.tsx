"use client";

import { useActionState } from "react";
import { createTransfer } from "../actions";
import type { Location } from "@/lib/data";
import { useT } from "@/components/LangProvider";

export function NewTransferForm({ locations, defaultFrom }: { locations: Location[]; defaultFrom?: number }) {
  const [state, action, pending] = useActionState(createTransfer, null);
  const v = state?.values;
  const t = useT();
  return (
    <form action={action} className="card">
      <div className="row">
        <label>{t("From")}
          <select key={`f${v?.from}`} name="from" defaultValue={v?.from ?? defaultFrom}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <label>{t("To")}
          <select key={`t${v?.to}`} name="to" defaultValue={v?.to ?? ""}>
            <option value="" disabled>{t("Choose…")}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label style={{ flex: 1 }}>{t("Note (optional)")}<input name="note" defaultValue={v?.note} placeholder={t("e.g. for customer reservation")} /></label>
      </div>
      <p />
      <label>{t("Scan each pair (one barcode per line). Scanning the same pair twice sends 2.")}
        <textarea key={state ? JSON.stringify(state) : "new"} name="barcodes" autoFocus defaultValue={v?.barcodes} />
      </label>
      {state?.error && <pre className="error small" style={{ whiteSpace: "pre-wrap" }}>{t(state.error)}</pre>}
      <p><button disabled={pending}>{pending ? t("Sending…") : t("Send")}</button></p>
    </form>
  );
}
