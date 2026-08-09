import type { MetadataRoute } from "next";
import { ALL_EXAMS } from "@/lib/dk/registry";

const SITE = "https://almidanish.almiworld.com";
const LASTMOD = "2026-08-09";

// HOLDING 2026-08-09 — one shard, keep-set only. Previously ~63 shards advertising the ~2.8M
// taught-study + ~0.5M jobs leaf URLs. Those routes no longer render (dynamicParams = false), so
// advertising them would only burn crawl budget and point Google at 404s. The shard math and the
// combo indexers in @/lib/seo/axes + @/lib/seo/taught-index are untouched — restore the imports,
// the STUDY_SHARDS/JOBS_SHARDS constants and the study/jobs branches below to reverse.
const TOTAL_SHARDS = 1;

// One entry per shard → Next emits /sitemap/[id].xml + an index at /sitemap.xml.
export async function generateSitemaps(): Promise<{ id: number }[]> {
  return Array.from({ length: TOTAL_SHARDS }, (_, id) => ({ id }));
}

function entry(path: string, priority = 0.5): MetadataRoute.Sitemap[number] {
  return { url: `${SITE}${path}`, lastModified: LASTMOD, changeFrequency: "monthly", priority };
}

// CRITICAL (Next 16): `id` arrives as a Promise<string> from the metadata-route
// loader. Must be `async` and `Number(await id)` — a synchronous `{id:number}`
// makes every comparison fail and each shard emits an empty <urlset> (110 bytes).
export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  void (await id); // Only shard 0 exists under holding, but `id` must still be awaited (see above).

  // Shard 0 — core marketing + auth + Danish-exam hub/levels. These are the keep-set: every one is
  // a prerendered static page, so none of them can produce an ISR write.
  const core = ["", "/pricing", "/signup", "/login", "/exams", "/study-in-denmark", "/work-in-denmark", "/requirements/denmark/prove-i-dansk-3-citizenship"]
    .map((p) => entry(p, p === "" ? 1 : 0.7));
  const levels = ALL_EXAMS.map((e) => entry(`/exams/${e.slug}`, 0.8));
  return [...core, ...levels];
}
