import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SUBJECT_BY_SLUG, COUNTRY_BY_SLUG, UNI_BY_SLUG } from "@/lib/seo/axes";
import { buildStudyPage } from "@/lib/seo/content";
import { resolveOriginBlock } from "@/lib/seo/origin-localization";
import { FunnelPage } from "@/components/seo/FunnelPage";

// HOLDING 2026-08-09 — ISR page-generation frozen. Was on-demand ISR over the ~2.8M taught-study
// leaf space; each first request rendered + cached, and that write is the cost driver. Blocking
// these paths in robots.txt did NOT stop it (robots is advisory and the Googlebot/Bingbot block
// has been live since 2026-07-28 while ISR writes still doubled) — only removing the render path
// does. Nothing is prerendered and nothing renders on demand, so every URL here 404s.
// Axis data and templates are untouched. Reverse by restoring `dynamicParams = true`.
export const dynamicParams = false;
export const revalidate = false;
export function generateStaticParams() { return []; }

type Params = Promise<{ subject: string; country: string; university: string }>;

function resolve(subject: string, country: string, university: string) {
  const s = SUBJECT_BY_SLUG.get(subject);
  const c = COUNTRY_BY_SLUG.get(country);
  const u = UNI_BY_SLUG.get(university);
  if (!s || !c || !u) return null;
  return { s, c, u };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { subject, country, university } = await params;
  const r = resolve(subject, country, university);
  if (!r) return { title: "Not found" };
  const p = buildStudyPage(r.s, r.c, r.u, resolveOriginBlock(r.c));
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: { canonical: p.canonicalPath },
    robots: p.indexable ? undefined : { index: false, follow: true },
    openGraph: { title: p.h1, description: p.metaDescription },
  };
}

export default async function Page({ params }: { params: Params }) {
  const { subject, country, university } = await params;
  const r = resolve(subject, country, university);
  if (!r) notFound();
  return <FunnelPage page={buildStudyPage(r.s, r.c, r.u, resolveOriginBlock(r.c))} />;
}
