import "./globals.css";
import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { LangProvider } from "@/components/LangProvider";
import { getLang } from "@/lib/lang";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--serif", display: "swap" });

export const metadata: Metadata = { title: "fourshub · 4 Seasons Shoes" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <html lang={lang} className={serif.variable}>
      <body><LangProvider lang={lang}>{children}</LangProvider></body>
    </html>
  );
}
