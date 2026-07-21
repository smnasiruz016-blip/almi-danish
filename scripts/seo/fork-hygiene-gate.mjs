// Build-time FORK HYGIENE GATE — the AlmiWorld §7 rule, enforced instead of trusted.
//
// WHY THIS EXISTS. This repo's lineage is:
//   almi-celpip → almi-goethe → almi-icelandic → almi-danish (you are here)
// AlmiDanish forked from AlmiIcelandic (its first commit says so; an early commit,
// "Purge residual Iceland proper nouns", shows the leak this gate makes permanent). The
// leak surfaces are Icelandic (Ríkisborgarapróf, Útlendingastofnun, is-IS), German (from
// AlmiGoethe), and Canadian English (from AlmiCELPIP). A Danish product has no reason to
// name any of them.
//
// Recurring lesson down this chain (documented in almi-swiss): the dangerous case is the
// LABEL localized while the FACT was not, and an identifier shipped in a spelling the
// banned list didn't hold (almi-swiss's SESSION_COOKIE was "almi_norwegian_session" while
// its list held only the HYPHEN form). Product names are ENUMERATED in all four shapes.
//
// Runs before the build and FAILS it on any hit. AlmiNorwegian descends from this repo:
// when re-cutting there, ADD the Danish nouns (they become ancestor leaks) and REMOVE
// what Norway legitimately owns — norwegian's gate does exactly that.
//
// ⚠️ RE-CUT NOTES specific to this fork:
//  1. Danish nouns are THIS product's subject and are DELIBERATELY not banned:
//     "Prøve i Dansk", "Indfødsretsprøven", "Studieprøven", "Styrelsen for
//     Patientsikkerhed", the acronym SIRI (Styrelsen for International Rekruttering),
//     "da-DK", "Læsning"/"Lytning"/"Skrivning". norwegian's gate BANS these because
//     there Danish is an ancestor; here they are the subject.
//  2. German SKILL words (Schreiben/Sprechen/Hören/Lesen) are banned by WORD BOUNDARY +
//     case, not substring, to avoid colliding with ordinary words.
//  3. Bare country names are NOT banned — a Danish item may name its Nordic neighbours as
//     content. Only the ancestors' exam/authority/institution/product/locale nouns leak.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts", "prisma"];
const SCAN_EXT = /\.(ts|tsx|js|mjs|json|prisma|css|md)$/;

const ALLOWLIST = new Map([
  ["src/lib/nav/family.ts", "links to sibling AlmiWorld products by name"],
  ["scripts/seo/fork-hygiene-gate.mjs", "documents the banned nouns"],
  // REAL-WORLD ORIGIN DATA, not authored copy. universities.json lists institutions
  // worldwide as ORIGIN references — a student really can move from the University of
  // Iceland (Háskóli Íslands) to Denmark, so its presence here is correct, not a leak.
  // The noun stays BANNED for PROSE (the copy that consumes this list is not allowlisted),
  // matching how almi-swiss allowlists the same file. A hole, but a narrow, data-only one.
  ["src/data/seo/universities.json", "worldwide origin institutions — Háskóli Íslands etc. are valid origins for a Danish product"],
]);

const LINE_ESCAPE = "hygiene-allow";

// Ancestor (Icelandic + German + CELPIP) proper nouns. ⚠️ RE-CUT AT EVERY FORK.
// Danish nouns are NOT here (they are this product's subject); bare country names are not.
const BANNED = [
  // — Icelandic (immediate ancestor) — institutions / exam / locale —
  "Ríkisborgarapróf", "Útlendingastofnun", "Háskóli Íslands",
  "is-IS",
  // — German (Goethe lineage) — institution / exam / locale —
  "Goethe-Institut", "Goethe-Zertifikat", "TestDaF",
  "de-DE",
  // — CELPIP (root) — Canadian English test + framework —
  "CELPIP", "Canadian Language Benchmark",
  "Immigration, Refugees and Citizenship Canada",
  // Sibling/ancestor PRODUCT names appended below — GENERATED, not hand-listed.
];

const ANCESTOR_PRODUCTS = ["celpip", "goethe", "icelandic"];
/** Every form a product slug ships in: almi-x · almi_x · almix · AlmiX. */
function productNameForms(p) {
  return [`almi-${p}`, `almi_${p}`, `almi${p}`, `Almi${p[0].toUpperCase()}${p.slice(1)}`];
}
for (const p of ANCESTOR_PRODUCTS) BANNED.push(...productNameForms(p));
BANNED.push("AlmiCELPIP");

// SELF-CHECK — a global find-replace can rewrite this list to ban our own name.
const SELF_NAMES = ["AlmiDanish", "almi-danish", "almi_danish", "almidanish"];
for (const n of SELF_NAMES) {
  if (BANNED.some((b) => b.toLowerCase() === n.toLowerCase())) {
    console.error("");
    console.error(`FORK-HYGIENE GATE IS MISCONFIGURED: BANNED contains "${n}", which is THIS product's own name.`);
    console.error("Every legitimate mention of ourselves would be reported as an ancestor leak. Fix BANNED.");
    console.error("");
    process.exit(2);
  }
}

// Word-boundary bans (\b) — collide with ordinary substrings otherwise. Case matters for
// the German nouns (Capitalised). NOTE: SIRI is NOT here — it is Denmark's own agency
// (Styrelsen for International Rekruttering); the swiss/norwegian gates ban it because
// there Denmark is an ancestor. CLB/IRCC are Canadian; telc is a German exam.
const BANNED_WORD = ["CLB", "IRCC", "telc", "Schreiben", "Sprechen", "Hören", "Lesen"];

// ── Scanning machinery (real-entity-gate design: strip comments, scan STRING values).

function stripComments(text) {
  let out = "";
  let i = 0;
  let quote = null;
  let inLine = false;
  let inBlock = false;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      else out += " ";
      i++; continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") { inBlock = false; out += "  "; i += 2; continue; }
      out += c === "\n" ? c : " ";
      i++; continue;
    }
    if (quote) {
      if (c === "\\") { out += text.slice(i, i + 2); i += 2; continue; }
      if (c === quote) quote = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; out += c; i++; continue; }
    if (c === "/" && n === "/") { inLine = true; out += "  "; i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; out += "  "; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

// Prisma comments are `//` and `///` — NOT `#`. stripComments handles `//` while
// respecting string literals, so prisma reuses it.

function jsonStrings(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const v of node) jsonStrings(v, out);
  else if (node && typeof node === "object") for (const v of Object.values(node)) jsonStrings(v, out);
  return out;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXT.test(e)) out.push(full);
  }
  return out;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (ALLOWLIST.has(rel)) continue;
    const raw = readFileSync(file, "utf8");
    let text;
    if (rel.endsWith(".json")) {
      try { text = jsonStrings(JSON.parse(raw)).join("\n"); }
      catch { text = raw; }
    } else if (rel.endsWith(".prisma")) {
      text = stripComments(raw);   // prisma comments are //
    } else {
      text = stripComments(raw);
    }
    const lines = text.split(/\r?\n/);
    const rawLines = raw.split(/\r?\n/);

    lines.forEach((line, i) => {
      if ((rawLines[i] ?? "").includes(LINE_ESCAPE)) return;
      for (const term of BANNED) {
        if (line.includes(term)) {
          violations.push(`${rel}:${i + 1}  banned ancestor noun "${term}"\n      ${line.trim().slice(0, 120)}`);
        }
      }
      for (const term of BANNED_WORD) {
        if (new RegExp(`\\b${term}\\b`).test(line)) {
          violations.push(`${rel}:${i + 1}  banned ancestor noun "${term}"\n      ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }
}

if (violations.length) {
  console.error("\n✗ FORK HYGIENE GATE FAILED — ancestor content found.\n");
  console.error("  Denmark must read as Denmark. These are leaks from the fork lineage");
  console.error("  (celpip → goethe → icelandic → danish).\n");
  for (const v of [...new Set(violations)]) console.error(`  ${v}`);
  console.error(`\n  ${violations.length} violation(s). Fix the FACT, not just the label.\n`);
  process.exit(1);
}

console.log(`✓ Fork hygiene gate: clean (no ancestor nouns across ${SCAN_DIRS.join(", ")}).`);
