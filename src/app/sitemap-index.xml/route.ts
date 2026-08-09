// Next 16's generateSitemaps does NOT emit a sitemap index — it only serves the
// shards at /sitemap/[id].xml. We publish an explicit <sitemapindex> here so
// there's ONE URL to submit to Google Search Console; it lists every shard.
//
// MUST mirror sitemap.ts exactly. Advertising more shards than sitemap.ts fills
// leaves the tail as phantom 404s in GSC.
//
// HOLDING 2026-08-09 — sitemap.ts is down to one keep-set shard, so this is too. Previously
// `1 + ceil(TAUGHT_STUDY_TOTAL/PER) + ceil(JOBS_TOTAL/PER)` ≈ 63 shards over ~3.3M leaf URLs.
// Restore that expression (and its two imports) alongside sitemap.ts to reverse.
export const dynamic = "force-static";

const SITE = "https://almidanish.almiworld.com";
const LASTMOD = "2026-08-09";
const TOTAL_SHARDS = 1;

export function GET(): Response {
  const items = Array.from({ length: TOTAL_SHARDS }, (_, i) =>
    `<sitemap><loc>${SITE}/sitemap/${i}.xml</loc><lastmod>${LASTMOD}</lastmod></sitemap>`,
  ).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items}</sitemapindex>`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" },
  });
}
