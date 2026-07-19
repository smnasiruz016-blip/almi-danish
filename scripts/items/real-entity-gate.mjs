// Real-entity gate — blocks invented messages attributed to real organisations.
//
// Ported from AlmiDutch, where the bank had shipped letters signed by real municipalities
// and seven named businesses, three of which turned out to be real practices. Every one
// survived review, because the surrounding facts were right. That is the danger: an
// invented document reads as credible exactly when nothing else about it is wrong.
//
// Two things this port inherits, both learned the hard way rather than designed in:
//
//   1. IT SCANS PARSED STRINGS, NOT JSON. The first Dutch version scanned
//      JSON.stringify(payload) and was blind to the very violation it was written for:
//      in serialised JSON a newline is a backslash and the LETTER n, so in
//      "hilsen,\nAarhus Kommune" the character before the name is a letter, \b never
//      matches, and a signature sails through. Mid-sentence names were caught, which is
//      why it looked like it worked — but a signature always sits right after a line
//      break. AlmiSwiss had already hit this and fixed it; the lesson was in the network
//      and got reintroduced anyway.
//
//   2. A NAME MUST SIT ON THE SAME LINE AS ITS CATEGORY NOUN ([ \t], not \s). Otherwise
//      a heading followed by an ordinary capitalised word reads as an institution:
//      Dutch produced "buurthuis Elke" (Elke = "every") and Swedish "biblioteket Varje".
//      A gate that reports violations that are not there gets switched off, and then it
//      protects nothing — the same end state as the memory-only rule these replace.
//
// Danish shape, which is NOT the Dutch one:
//   - Word order reverses. Dutch writes "Gemeente Almere"; Danish writes "Aarhus
//     Kommune" — the name comes FIRST. A pattern ported literally would never fire.
//   - Definiteness carries the meaning. "Kommune" follows a name; "kommunen" means "the
//     municipality" generically and is exactly what we want authors to write. Flagging
//     the definite form would flag every correct usage.
//
// Deliberately NOT flagged: a real place as setting, a real station in a transport
// announcement, a public body named factually in a knowledge question. Those are
// accurate, not misattributed.

import fs from "node:fs";
import path from "node:path";

const ITEMS_DIR = path.join(process.cwd(), "src", "data", "items");
const problems = [];

// Name + "Kommune"/"Kommunen" as a proper title, on one line.
const MUNICIPALITY_AS_ACTOR = /\b([A-ZÆØÅ][a-zæøå]+s?)[ \t]+(Kommune|kommune)\b/g;

const CATEGORY_NOUNS = [
  "lægehuset", "lægeklinikken", "tandlægen", "tandlægeklinikken", "apoteket", "sygehuset",
  "skolen", "folkeskolen", "børnehaven", "vuggestuen", "biblioteket", "svømmehallen",
  "butikken", "supermarkedet", "boligforeningen", "udlejeren", "sportsklubben",
  "sprogskolen", "fagforeningen", "banken", "forsikringsselskabet",
];
const NAMED_BUSINESS = new RegExp(
  `\\b(${CATEGORY_NOUNS.join("|")})[ \\t]+([A-ZÆØÅ][a-zæøå]{2,})`,
  "g",
);

// Helvetia class: a real firm signing an invented letter.
const BRAND_DENYLIST = [
  "Netto", "Føtex", "Bilka", "Rema 1000", "Lidl", "Aldi", "Irma", "Kvickly", "Brugsen",
  "Danske Bank", "Nordea", "Nykredit", "Jyske Bank", "Sydbank", "Arbejdernes Landsbank",
  "Tryg", "Topdanmark", "Alm. Brand", "Codan",
  "TDC", "YouSee", "Telenor", "Telia", "Ørsted", "Norlys",
  "DSB", "Movia", "Rejsekort", "PostNord", "Matas", "Elgiganten", "Bilka", "Jysk",
];

// Collect every string in a payload, so patterns run against real text with real
// boundaries — never against escaped JSON.
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) strings(x, out);
  return out;
}

let scanned = 0;
for (const file of fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, file), "utf8"));
  for (const [i, item] of (raw.items ?? raw).entries()) {
    scanned++;
    const where = `${file}[${i}] "${item.title}"`;
    for (const text of strings(item.payload)) {
      for (const m of text.matchAll(MUNICIPALITY_AS_ACTOR)) {
        problems.push(`${where}: names a municipality — "${m[0]}". Use "kommunen"; a real municipality must never author invented text.`);
      }
      for (const m of text.matchAll(NAMED_BUSINESS)) {
        problems.push(`${where}: names an institution — "${m[1]} ${m[2]}". Use the bare category ("${m[1]}").`);
      }
      for (const brand of BRAND_DENYLIST) {
        if (new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) {
          problems.push(`${where}: names a real company — "${brand}". Use a generic category.`);
        }
      }
    }
  }
}

if (problems.length) {
  console.error(`\nREAL-ENTITY GATE FAILED — ${problems.length} problem(s) across ${scanned} items:\n`);
  for (const p of [...new Set(problems)]) console.error(`  ✗ ${p}`);
  console.error("\nAn invented letter, call or notice must not carry a real organisation's name.\nReal places as SETTING are fine and are not flagged.\n");
  process.exit(1);
}
console.log(`real-entity gate: ${scanned} items clean (no invented text attributed to a named organisation)`);
