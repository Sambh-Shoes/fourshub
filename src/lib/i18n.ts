// Screen text in three languages. The English text itself is the key: t("Clock in") returns the Spanish or
// Russian words when the person chose them, and the English text when no translation exists yet (so a missing
// translation never breaks a screen). Pieces that change use {name} slots: t("Hello, {name}", { name }).
import { es } from "./messages/es";
import { ru } from "./messages/ru";

export const LANGS = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const LANG_COOKIE = "fh_lang";

export function asLang(v: unknown): Lang {
  return v === "es" || v === "ru" ? v : "en";
}

const DICT: Record<Lang, Record<string, string>> = { en: {}, es, ru };

export function translate(lang: Lang, text: string, vars?: Record<string, string | number>): string {
  let out = DICT[lang][text] ?? text;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v));
  return out;
}

export type T = (text: string, vars?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): T => (text, vars) => translate(lang, text, vars);

/** The locale for dates and numbers. Spain's formats for everyone (euros, dd/mm/yyyy), as before. */
export const LOCALE = "es-ES";
