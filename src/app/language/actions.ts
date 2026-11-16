"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { LANG_COOKIE, asLang } from "@/lib/i18n";

/** Saves the language for this browser and, when signed in, on the person's account so it follows them. */
export async function setLanguage(code: string) {
  const lang = asLang(code);
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const user = await getUser();
  if (user) await query("UPDATE users SET language = $2 WHERE id = $1", [user.id, lang]);
  revalidatePath("/", "layout");
}
