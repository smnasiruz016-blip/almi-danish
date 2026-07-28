import type { MetadataRoute } from "next";

const SITE_URL = "https://almidanish.almiworld.com";

// PRIORITY SITE — ~3.3M pSEO leaf space (2.8M taught-study + 0.5M jobs) despite
// small exam content; #2 request-generator in Observability. Deep per-origin
// long-tail leaves below; the /study-in-denmark/<subject>, /work-in-denmark/<role>
// and /exams/<level> hubs plus landing pages stay crawlable.
const DEEP_LEAVES = ["/study-in-denmark/*/from/", "/work-in-denmark/*/from/"];

// Heavy crawlers that burn Vercel invocations + ISR writes with ~no SEO upside.
// robots.txt is advisory — these DO obey it; abusive scrapers need BotID/WAF.
// Google-Extended = Gemini TRAINING token, NOT search — blocking it is rank-safe.
const HEAVY_BOTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "anthropic-ai",
  "CCBot", "Bytespider", "Amazonbot", "PerplexityBot", "Google-Extended",
  "AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "DataForSeoBot", "PetalBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // DEEP_LEAVES applies to Googlebot and Bingbot TOO. Leaving them out was the
      // hole in the 2026-07-20 crawl-cost fix (#8): `*` was blocked from the leaf
      // space while the two crawlers most able to walk 3.3M URLs kept full access,
      // and each first visit to an ungenerated leaf costs one ISR write. almi-danish
      // billed $58.40 in ISR writes in the 2026-07 cycle with this rule in place.
      { userAgent: ["Googlebot", "Bingbot"], allow: "/", disallow: ["/practice/", "/account", "/admin", "/api/", ...DEEP_LEAVES] },
      { userAgent: "*", allow: "/", disallow: ["/practice/", "/account", "/admin", "/api/", ...DEEP_LEAVES], crawlDelay: 10 },
      { userAgent: HEAVY_BOTS, disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap-index.xml`,
  };
}
