import "./globals.css";
import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";

const serif = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--serif", display: "swap" });

export const metadata: Metadata = { title: "fourshub · 4 Seasons Shoes" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={serif.variable}>
      <body>{children}</body>
    </html>
  );
}
