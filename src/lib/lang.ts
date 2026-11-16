import { cookies } from "next/headers";
import { LANG_COOKIE, asLang, makeT, type Lang, type T } from "./i18n";

/** The language of the person looking at the screen (from their cookie, English if none). */
export async function getLang(): Promise<Lang> {
  return asLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT(): Promise<T> {
  return makeT(await getLang());
}
