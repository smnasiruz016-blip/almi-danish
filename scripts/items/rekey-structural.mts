// STRUCTURAL RE-KEY — make MATCHING and ORDERING items require reading.
//
// THE DEFECT. 19 of 46 structural items in the bank were answerable with no Icelandic
// at all:
//
//   ORDERING  answer.order was [0,1,2,3] on every single one. The renderer displays
//             payload.items in array order and the response is the learner's sequence
//             of original indices, so a key of [0,1,2,3] means the steps are ALREADY
//             PRINTED in the right order — pressing submit without touching anything
//             scored full marks.
//   MATCHING  answer.pairs matched row n to row n on every single one. The renderer
//             lists payload.left down the page each with a dropdown of payload.right,
//             so "pair them straight down" scored 100%.
//
// THE FIX, AND WHY IT CANNOT CHANGE WHAT IS CORRECT. Only the DISPLAY order moves:
//
//   ORDERING  payload.items is permuted and answer.order is recomputed so that it still
//             reconstructs the same sequence of TEXTS. The right answer to "put these
//             steps in order" is unchanged; the steps just no longer arrive pre-sorted.
//   MATCHING  payload.right is permuted and answer.pairs is remapped so each left item
//             still points at the same right TEXT.
//
// Both are verified after the fact against the untouched originals: the reconstructed
// sequence of texts, and every left-text→right-text pairing, must be identical. If one
// differs the run writes nothing.
//
// CONSTRAIN THE RESULT, NOT THE TRANSFORMATION. This is the same lesson as the reversal
// trap below, one level deeper, and this bank is what exposed it. Deranging the right
// column works as a proxy for "the key is no longer trivial" ONLY when the key started
// AS the identity. Some Icelandic MATCHING keys are already non-identity — "Family
// words" pairs mamma→mother, pabbi→father, systir→sister as [[0,2],[1,0],[2,1]] — so
// permuting the column can land the RESULT on the identity and make a good item
// gameable. The permutation is therefore redrawn until the resulting KEY is neither the
// identity nor the reversal, which is the property actually wanted.
//
// A DERANGEMENT, NOT A SHUFFLE — AND NOT A REVERSAL EITHER. A random permutation can
// land back on the identity, which is how "we shuffled it" becomes "it is still
// gameable". So the permutation is drawn deterministically and rejected until no
// element sits in its original place.
//
// Rejecting the identity is not enough, and the audit proved it rather than the code
// anticipating it: the first run of this script left three ORDERING items keyed to
// EXACTLY THE PRINTED ORDER REVERSED. [3,2,1,0] is a perfectly good derangement — no
// element is where it started — and it is just as answerable with no Icelandic as the
// identity was. "Read it bottom to top" replaced "submit untouched". Full reversal is
// rejected too.
//
// Deterministic, seeded per item, so re-running reproduces the same bank exactly.
//
// Run: npx tsx scripts/items/rekey-structural.mts [--dry]

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const ITEMS_DIR = path.join(process.cwd(), "src", "data", "items");

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A permutation of 0..n-1 with NO fixed point and which is NOT the full reversal.
 *  Redrawn until both hold. n < 2 cannot be deranged and is returned unchanged (and
 *  reported, so it is not silently counted as "fixed"). */
function derangement(n: number, seed: number): number[] {
  if (n < 2) return Array.from({ length: n }, (_, i) => i);
  const isIdentity = (p: number[]) => p.every((v, i) => v === i);
  const isReversal = (p: number[]) => p.every((v, i) => v === n - 1 - i);
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < 500; attempt++) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (p.some((v, i) => v === i)) continue;   // has a fixed point
    if (isReversal(p)) continue;               // "read it bottom to top" is not a fix
    return p;
  }
  // Fallback: a single cycle is a derangement for n >= 2, and is the reversal only at
  // n = 2 — where every derangement is the reversal and nothing better exists.
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

const files = fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith(".json"));
const banks = new Map<string, any[]>();
const original = new Map<string, any[]>();
for (const f of files) {
  const raw = fs.readFileSync(path.join(ITEMS_DIR, f), "utf8");
  banks.set(f, JSON.parse(raw));
  original.set(f, JSON.parse(raw));
}

let ordered = 0, matched = 0;
const skipped: string[] = [];

for (const [file, items] of banks) {
  items.forEach((it: any, i: number) => {
    const a = it.answer;
    if (!a) return;
    const seed = hashSeed(`${it.track}|${it.exam}|${it.skill}|${it.title}`);

    if (a.type === "ORDERING") {
      const texts: string[] = it.payload?.items ?? [];
      const n = texts.length;
      if (n < 2) { skipped.push(`${file}[${i}] ${it.title} — ORDERING with ${n} item(s)`); return; }
      // The correct sequence of TEXTS, read off the current key before anything moves.
      const correctTexts = a.order.map((idx: number) => texts[idx]);
      let newItems: string[] = texts, newOrder: number[] = a.order;
      for (let attempt = 0; attempt < 64; attempt++) {
        const perm = derangement(n, seed + attempt);   // newItems[k] = texts[perm[k]]
        const cand = perm.map((src) => texts[src]);
        const used = new Set<number>();
        const ord = correctTexts.map((t: string) => {
          const k = cand.findIndex((x, idx) => x === t && !used.has(idx));
          used.add(k);
          return k;
        });
        const isId = ord.every((v: number, k: number) => v === k);
        const isRev = n > 2 && ord.every((v: number, k: number) => v === n - 1 - k);
        if (!isId && !isRev) { newItems = cand; newOrder = ord; break; }
      }
      it.payload.items = newItems;
      a.order = newOrder;
      ordered++;
    }

    if (a.type === "MATCHING") {
      const right: string[] = it.payload?.right ?? [];
      const n = right.length;
      if (n < 2) { skipped.push(`${file}[${i}] ${it.title} — MATCHING with ${n} option(s)`); return; }
      for (let attempt = 0; attempt < 64; attempt++) {
        const perm = derangement(n, seed + attempt);   // newRight[k] = right[perm[k]]
        const posOf = new Map<number, number>();       // old right index → new position
        perm.forEach((src, k) => posOf.set(src, k));
        const cand = a.pairs.map(([l, r]: [number, number]) => [l, posOf.get(r)!]);
        const isId = cand.every(([l, r]: [number, number]) => l === r);
        const isRev = n > 2 && cand.every(([l, r]: [number, number]) => r === n - 1 - l);
        if (!isId && !isRev) {
          it.payload.right = perm.map((src) => right[src]);
          a.pairs = cand;
          break;
        }
      }
      matched++;
    }
  });
}

// ── VERIFY AGAINST THE UNTOUCHED ORIGINALS ──────────────────────────────────
const breaks: string[] = [];
for (const [file, items] of banks) {
  const before = original.get(file)!;
  items.forEach((it: any, i: number) => {
    const a = it.answer, b = before[i]?.answer;
    if (!a || !b) return;
    if (a.type === "ORDERING") {
      const now = a.order.map((k: number) => it.payload.items[k]).join(" | ");
      const was = b.order.map((k: number) => before[i].payload.items[k]).join(" | ");
      if (now !== was) breaks.push(`${file}[${i}] "${it.title}": ORDERING sequence changed\n      was: ${was}\n      now: ${now}`);
      const n = a.order.length;
      if (n > 1 && a.order.every((v: number, k: number) => v === k)) {
        breaks.push(`${file}[${i}] "${it.title}": ORDERING key is STILL the identity`);
      }
      if (n > 2 && a.order.every((v: number, k: number) => v === n - 1 - k)) {
        breaks.push(`${file}[${i}] "${it.title}": ORDERING key is the printed order REVERSED — as gameable as the identity`);
      }
    }
    if (a.type === "MATCHING") {
      const now = a.pairs.map(([l, r]: [number, number]) => `${it.payload.left[l]}=>${it.payload.right[r]}`).sort().join(" | ");
      const was = b.pairs.map(([l, r]: [number, number]) => `${before[i].payload.left[l]}=>${before[i].payload.right[r]}`).sort().join(" | ");
      if (now !== was) breaks.push(`${file}[${i}] "${it.title}": MATCHING pairing changed\n      was: ${was}\n      now: ${now}`);
      const np = a.pairs.length;
      if (np > 1 && a.pairs.every(([l, r]: [number, number]) => l === r)) {
        breaks.push(`${file}[${i}] "${it.title}": MATCHING key is STILL the identity`);
      }
      if (np > 2 && a.pairs.every(([l, r]: [number, number]) => r === np - 1 - l)) {
        breaks.push(`${file}[${i}] "${it.title}": MATCHING key is the column REVERSED — as gameable as the identity`);
      }
    }
  });
}

console.log(`ORDERING re-keyed: ${ordered}   MATCHING re-keyed: ${matched}`);
if (skipped.length) { console.log("skipped (too small to derange):"); skipped.forEach((s) => console.log("  " + s)); }

if (breaks.length) {
  console.error(`\n✗ CORRECTNESS BROKEN in ${breaks.length} place(s) — writing NOTHING:\n`);
  breaks.slice(0, 10).forEach((b) => console.error("  " + b));
  process.exit(1);
}
console.log("✓ correctness preserved: every ORDERING reconstructs the same text sequence, every MATCHING keeps the same text pairings, and no key is the identity.");

if (DRY) {
  console.log("\n--dry: no files written.");
} else {
  for (const [file, items] of banks) fs.writeFileSync(path.join(ITEMS_DIR, file), JSON.stringify(items, null, 2) + "\n", "utf8");
  console.log(`\nwrote ${banks.size} bundle(s).`);
}
