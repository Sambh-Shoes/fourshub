// Shoe sizes sort as numbers (35, 35.5, 36 ...), anything else goes after.
export function compareSizes(a: string | null, b: string | null) {
  const na = a === null ? NaN : Number(a.replace(",", "."));
  const nb = b === null ? NaN : Number(b.replace(",", "."));
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  if (!isNaN(na)) return -1;
  if (!isNaN(nb)) return 1;
  return (a ?? "").localeCompare(b ?? "");
}

export function euro(value: string | number | null) {
  if (value === null) return "";
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value));
}
