"use client";

import { useState } from "react";
import { ALL_SIZES, SIZE_PRESETS } from "@/lib/sizePresets";
import type { Location } from "@/lib/data";

/** Tick all sizes at once (or use a preset), and type the starting pairs for each. */
export function SizePicker({ locations, defaultLocation, initial }: {
  locations: Location[]; defaultLocation?: number; initial?: { sizes?: string; colours?: string; location_id?: string; box?: string };
}) {
  const [sizes, setSizes] = useState<string[]>(initial?.sizes ? initial.sizes.split(",") : []);
  const [extra, setExtra] = useState("");
  const [colourText, setColourText] = useState(initial?.colours ?? "");
  const colourList = [...new Set(colourText.split(",").map((c) => c.trim().replace(/\s+/g, " ")).filter(Boolean))];
  const rows = colourList.length ? colourList : [""];
  const toggle = (s: string) => setSizes(sizes.includes(s) ? sizes.filter((x) => x !== s) : [...sizes, s]);
  const shown = [...ALL_SIZES, ...sizes.filter((s) => !ALL_SIZES.includes(s))];
  const warehouse = locations.find((l) => l.kind === "warehouse")?.id;

  return (
    <>
      <label>Colours (separate with commas: each colour gets all the sizes)
        <input name="colours" value={colourText} onChange={(e) => setColourText(e.target.value)} placeholder="e.g. Negro, Marrón" />
      </label>
      <p />
      <div className="muted small">Sizes</div>
      <div className="row" style={{ margin: "6px 0" }}>
        {SIZE_PRESETS.map((p) => (
          <button key={p.label} type="button" className="secondary" onClick={() => setSizes(p.sizes)}>{p.label}</button>
        ))}
        <button type="button" className="secondary" onClick={() => setSizes([])}>Clear</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {shown.map((s) => (
          <label key={s} className="check sizebox" style={sizes.includes(s) ? { background: "var(--accent-soft)", borderColor: "var(--accent)" } : {}}>
            <input type="checkbox" name="size" value={s} checked={sizes.includes(s)} onChange={() => toggle(s)} /> {s}
          </label>
        ))}
        <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="other size" style={{ width: 100 }} />
        <button type="button" className="secondary" onClick={() => { if (extra.trim()) { setSizes([...sizes, extra.trim()]); setExtra(""); } }}>Add</button>
      </div>

      {sizes.length > 0 && (
        <>
          <h2>Starting pairs (optional)</h2>
          <div className="row">
            <label>Put them in
              <select name="location_id" defaultValue={initial?.location_id || defaultLocation || warehouse}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Box<input name="box" defaultValue={initial?.box} style={{ width: 100 }} /></label>
          </div>
          <p />
          <div className="table-wrap"><table className="sizes">
            <thead><tr><th className="loc">Size</th>{[...sizes].sort(cmp).map((s) => <th key={s}>{s}</th>)}</tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c}>
                  <td className="loc">{c || "Pairs"}</td>
                  {[...sizes].sort(cmp).map((s) => (
                    <td key={s}><input name={`qty:${c.toLowerCase()}:${s}`} type="number" min={0} inputMode="numeric" style={{ width: 54, textAlign: "center" }} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
    </>
  );
}

function cmp(a: string, b: string) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return isNaN(na) ? 1 : -1;
}
