// Times are stored in UTC and always shown in shop time.
export const TZ = "Europe/Madrid";

export function hm(minutes: number | string | null) {
  const m = Math.round(Number(minutes ?? 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export function clock(d: Date | null) {
  return d ? d.toLocaleTimeString("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }) : "";
}

/** "2026-10" for the current month in shop time. */
export function thisMonth() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ }).slice(0, 7);
}
