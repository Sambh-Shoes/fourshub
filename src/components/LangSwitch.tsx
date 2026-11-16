"use client";

import { useTransition } from "react";
import { LANGS, type Lang } from "@/lib/i18n";
import { setLanguage } from "@/app/language/actions";

export function LangSwitch({ current }: { current: Lang }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="lang"
      aria-label="Language"
      value={current}
      disabled={pending}
      onChange={(e) => start(() => setLanguage(e.target.value))}
    >
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
