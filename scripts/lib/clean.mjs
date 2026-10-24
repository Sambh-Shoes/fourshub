// Suggested clean-up of Odoo attribute values. These are only suggestions:
// the approved result lives in mapping/attributes.csv, which wins over these rules.

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const squash = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Colour words: spelling fixes and English/other words to the Spanish the shops use.
const COLOUR_WORDS = {
  marron: "marrón", maron: "marrón", cafe: "café", "café": "café", beis: "beige",
  budeos: "burdeos", bordeaux: "burdeos", griss: "gris", blanca: "blanco", violet: "violeta",
  silver: "plateado", plata: "plateado", gold: "dorado", oro: "dorado", khaki: "caqui",
  milk: "leche", camello: "camel", cremoso: "crema", cremosas: "crema", granada: "granate",
  apricote: "albaricoque", abricot: "albaricoque", apricot: "albaricoque", light: "claro", rose: "rosa", metalico: "metalizado",
  blestiasho: "brillante", beruzovi: "turquesa", leopard: "leopardo", aqua: "aguamarina",
};
// Whole values that mean something simpler.
const COLOUR_WHOLE = {
  "metalizado silver": "plateado", "silver metalizado": "plateado", "metalizado plateado": "plateado",
  "plateado metalico": "plateado", "metalizado oro": "dorado", "dorado metalico": "dorado",
  "azul, oscuro 424": "azul oscuro", "maron,café": "marrón", "marron 567": "marrón",
  "azul beruzovi": "turquesa", "light verde": "verde claro", "azul light": "azul claro",
  "light rose": "rosa claro", "negro rojo": "negro / rojo", "blanco negro": "blanco / negro", "blanco azul": "blanco / azul", "negro oscuro": "negro", "negro piel": "negro", "metalizado": "metalizado",
};

export function cleanColour(raw) {
  if (!raw) return { value: null };
  let s = squash(raw);
  if (COLOUR_WHOLE[s]) return { value: cap(COLOUR_WHOLE[s]) };
  s = s.replace(/\s*[-,/]\s*/g, " / ");
  s = s.split(" ").map((w) => COLOUR_WORDS[w] ?? w).join(" ");
  s = s.replace(/^claro (\S+)$/, "$1 claro").replace(/^rosa metalizado$/, "rosa metalizado");
  return { value: cap(s) };
}

const MATERIAL_WORDS = {
  cuero: "piel", // Maryna: cuero and piel are the same
  matovi: "mate", mati: "mate", textilo: "textil", cashemira: "cachemir", nachris: "piel",
  polipiel: "polipiel", "on": "con", nate: "ante",
};
export function cleanMaterial(raw) {
  if (!raw) return { value: null };
  let s = squash(raw);
  if (s === "de" || s === "color" || s === "negro") return { value: null, note: "not a material, left empty" };
  s = s.split(" ").map((w) => MATERIAL_WORDS[w] ?? w).join(" ");
  s = s.replace(/\s*-\s*/g, " y ").replace(/ mas /g, " y ").replace(/^(piel|cuero) con serraje$/, "$1 y serraje");
  if (s === "serraje y piel" || s === "serraje piel natural") s = "piel y serraje";
  if (s === "serraje piel") s = "piel y serraje";
  if (s === "piel serraje") s = "piel y serraje";
  const WHOLE = { "mate y piel": "piel mate", "serraje mat": "serraje mate", "algodon": "algodón", "serraje marron": "serraje" };
  if (WHOLE[s]) s = WHOLE[s];
  return { value: cap(s) };
}

export function cleanSize(raw) {
  if (!raw) return { value: null };
  const s = squash(raw).replace(",", ".");
  if (/^\d{2}(\.5)?$/.test(s)) {
    const n = Number(s);
    if (n >= 15 && n <= 50) return { value: s };
  }
  if (/^\d{2}-\d{2}$/.test(s)) return { value: s };       // ranges like 35-40 (socks)
  if (/^one size$/.test(s)) return { value: "Única" };
  if (/^big sizes?$/.test(s)) return { value: "Grande" };
  if (/^small sizes?$/.test(s)) return { value: "Pequeña" };
  if (/^[xsml]{1,3}$/.test(s)) return { value: s.toUpperCase() };
  // Jewellery measurements such as "36-15-31" stay exactly as written (confirmed by Maryna).
  if (/^\d+(\.\d)?-\d+-\d+$/.test(s)) return { value: raw.trim(), note: "jewellery measurement" };
  return { value: null, note: "not a size, left empty" };
}

export function cleanBox(raw) {
  if (!raw) return { value: null };
  return { value: raw.trim().toUpperCase() };
}
