import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { GlobalHeader } from "@/components/GlobalHeader";
import { GlobalFooter } from "@/components/GlobalFooter";

// RR-400: the Allura script font was loaded (and preloaded, ~49 KB) on every page but no element uses `font-script`, so it only
// competed with the page for bandwidth before the first big paint. Removed; Inter stays.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

const SITE_URL = "https://almidanish.almiworld.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AlmiDanish — Prøve i Dansk & Studieprøven practice with honest AI feedback",
    template: "%s · AlmiDanish",
  },
  description:
    "Practise the Danish exams — Prøve i Dansk 1, 2 and 3, Studieprøven, and the Indfødsretsprøven and Medborgerskabsprøven knowledge tests — with honest per-skill readiness estimates and AI feedback. Try free for 48 hours, no card. Then $12/month. Original material, never copied from official exam papers. Confirm residency and citizenship rules with SIRI. Part of the AlmiWorld family.",
  applicationName: "AlmiDanish",
  authors: [{ name: "AlmiWorld" }],
  keywords: ["Prøve i Dansk", "Prøve i Dansk 3", "Danish citizenship test", "Indfødsretsprøven", "Medborgerskabsprøven", "Studieprøven", "learn Danish", "Danish exam practice", "permanent residence Denmark", "AlmiDanish", "AlmiWorld"],
  openGraph: {
    title: "AlmiDanish — honest Prøve i Dansk & Studieprøven practice",
    description: "Original Danish practice for the Prøve i Dansk ladder, Studieprøven and the Danish society knowledge tests — honest per-skill readiness estimates and AI feedback.",
    url: SITE_URL,
    siteName: "AlmiDanish",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: "AlmiDanish — Prøve i Dansk & Studieprøven practice", description: "Honest Danish practice — per-skill readiness estimates, ranges not inflated numbers." },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <GlobalHeader />
        <div className="flex flex-1 flex-col">{children}</div>
        <GlobalFooter />
      </body>
    </html>
  );
}
