// REBALANCE THE TRUE/FALSE VALUE AXIS.
//
// De-gaming POSITION exposed a second defect underneath it. Two sections had no mix at
// all — and unusually, one in each direction:
//
//   MEDBORGERSKABSPROVEN::KNOWLEDGE   3 of 3 TRUE   → "answer True to everything" = 100%
//   STUDIEPROVEN::READING             3 of 3 FALSE  → "answer Forkert to everything" = 100%
//
// While the keys were also clustered on one index the two defects were collinear and
// only position was visible; balancing position separated them. The audit files this as
// B1v at P3 because a value axis is usually an option id nobody sees — true for goethe
// and French, WRONG here, where the options render as their own text.
//
// Permutation cannot fix a truth value, so the MINIMUM number of statements is flipped —
// one per section — each made genuinely true or false of its own source. Both sections
// become 2/1. Nothing is flipped to "balance a count": each rewrite is listed with the
// evidence for its new truth value and can be checked without opening another file.
//
// ── THE CIVICS SECTION NEEDS MORE CARE THAN A READING SECTION ───────────────────
// Medborgerskabsprøven statements are standalone factual claims about Denmark with no
// passage to check them against, so "make one false" means asserting something that is
// verifiably NOT true of Denmark. A vague or arguable distractor would be worse than the
// all-true bank it replaces: a learner could be marked wrong for knowing the real answer.
// The one chosen is unambiguous and sits squarely on the fact the sibling statement
// already establishes — GP visits are covered, so "must pay the full cost" is plainly
// false. No new civic claim is introduced; the existing one is inverted.
//
// Run BEFORE degame-options.mts — flipping a key moves the position distribution, so
// positions are rebalanced afterwards.

import fs from "node:fs";
import path from "node:path";

const ITEMS_DIR = path.join(process.cwd(), "src", "data", "items");

/** Each entry: the item, its new statement, the option that becomes correct, and the
 *  evidence for that truth value. */
const REWRITES: {
  file: string; index: number; title: string;
  statement: string; correct: string; evidence: string;
}[] = [
  // ── MEDBORGERSKABSPROVEN::KNOWLEDGE — 1 of 3 becomes FALSE (was 3/3 true) ──
  {
    file: "medborgerskabsproven.json", index: 12, title: "Public healthcare",
    statement: "Residents in Denmark must pay the full cost of a visit to their general practitioner.",
    correct: "False",
    evidence:
      "Inverts the fact the item already taught: basic public healthcare, including GP " +
      "visits, is free of direct charge for residents. Unambiguous — no new civic claim.",
  },
  // ── STUDIEPROVEN::READING — 1 of 3 becomes TRUE (was 3/3 Forkert) ──
  {
    file: "studieproven-reading.json", index: 7, title: "Automation and jobs",
    statement: "Ifølge teksten har ny teknologi historisk set både nedlagt og skabt arbejdspladser.",
    correct: "Rigtigt",
    evidence: "\"Historisk set har nye teknologier dog både nedlagt og skabt job…\"",
  },
];

const banks = new Map<string, any[]>();
const load = (f: string) => {
  if (!banks.has(f)) banks.set(f, JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), "utf8")));
  return banks.get(f)!;
};

console.log("── statements rewritten, each with its evidence ──");
let changed = 0;
for (const r of REWRITES) {
  const it = load(r.file)[r.index];
  if (!it) throw new Error(`${r.file}[${r.index}] does not exist`);
  if (it.title !== r.title) {
    // The index is a position in a file other passes also edit. Asserting the title
    // makes a silent mis-target impossible: rewriting the WRONG item would produce a
    // fluent, plausible, false question — the worst outcome here, and worse still in a
    // civics module.
    throw new Error(`${r.file}[${r.index}] is "${it.title}", expected "${r.title}" — refusing to rewrite the wrong item`);
  }
  if (it.answer?.type !== "TRUE_FALSE") throw new Error(`${r.file}[${r.index}] is not TRUE_FALSE`);
  const idx = it.payload.options.indexOf(r.correct);
  if (idx < 0) throw new Error(`${r.file}[${r.index}] has no "${r.correct}" option: ${JSON.stringify(it.payload.options)}`);

  const before = it.payload.question ?? it.payload.statement;
  const beforeKey = it.payload.options[it.answer.correctIndex];
  it.payload.question = r.statement;
  delete it.payload.statement;
  it.answer.correctIndex = idx;
  changed++;
  console.log(`  ✓ ${r.file}[${r.index}] ${r.title}`);
  console.log(`      before: ${before}   → ${beforeKey}`);
  console.log(`      after:  ${r.statement}   → ${r.correct}`);
  console.log(`      why:    ${r.evidence}`);
}

for (const [f, items] of banks) {
  fs.writeFileSync(path.join(ITEMS_DIR, f), JSON.stringify(items, null, 2) + "\n", "utf8");
}
console.log(`\n${changed} statement(s) rewritten; ${banks.size} bundle(s) written.`);
console.log("Now re-run scripts/items/degame-options.mts to rebalance POSITION.");
