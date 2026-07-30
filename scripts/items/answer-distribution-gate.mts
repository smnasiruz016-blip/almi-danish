// ANSWER-DISTRIBUTION GATE — can the correct answer be found without reading Dutch?
//
// This bank has already been gamed once. Before the de-game pass, 17 of 22 objective
// sections clustered on a single answer position, fourteen of them at 100%: both KNM
// modules were 30 of 30 correct-at-index-0, and every READING::CLOZE gap in the bank
// sat at index 0. A learner who always picked the first option scored 100% on the whole
// civic-knowledge surface knowing no Dutch at all.
//
// Fixing the bank fixed the bank. It does nothing about the next authoring pass, and
// the way this defect arises is not carelessness — it is what happens naturally when a
// human writes the right answer first and the distractors after it. So the rule has to
// live in the build, where it blocks, rather than in anyone's memory.
//
// ── TWO AXES, BECAUSE FIXING ONE EXPOSED THE OTHER ──────────────────────────────
//
// POSITION — "always pick index N". Ported from the AlmiSwiss gate, type-aware:
//     MULTI  (MCQ_SINGLE, CLOZE)  no option index may hold more than CLUSTER of a
//                                 section's answers (spread rule, needs MIN_N)
//     BINARY (TRUE_FALSE)         neither value past BINARY_SKEW (spread rule, MIN_N)
//     EXTREME (any type)          one value at/above EXTREME_SKEW fires at any n ≥ 3 —
//                                 a 3/3 all-same section is gameable on three answers,
//                                 and MIN_N was hiding exactly those.
//
// VALUE — "always answer Niet waar". The Swiss gate does not check this and would have
// passed this bank. Balancing POSITION here uncovered that every true/false statement in
// five sections was false: 19 TF items, not one true statement among them. While the
// keys were also all at one index the two defects were collinear and only position was
// visible; separating them left the value one standing on its own.
//
// The value rule only applies where the option TEXTS are shared across the section —
// true/false being the case that matters. For MCQ every item carries its own options,
// so "always answer X" is not a strategy and counting texts there would manufacture
// findings out of correct content. The gate checks that the option SET is identical
// across the section before it judges the value axis at all.
//
// MATCHING and ORDERING are not single-index gameable and are excluded here; their own
// degeneracy (identity pairs, pre-sorted steps, and the printed order reversed) is a
// different shape and is not what this rule measures.
//
// ── FAIL ON ZERO ────────────────────────────────────────────────────────────────
// A gate that scans nothing prints a tick. That is not a hypothetical in this family:
// a sibling's ceiling-gate ticked over zero of 1,388 items because a mangled dash made
// its pattern match nothing, and the only tell was a counter that did not move. If the
// bank is empty or unreadable this exits 1 and says so — an instrument answers for its
// own coverage before it is allowed to answer about the thing it measures.
//
// SEEN RED: re-game any section (all keys to idx 0, or every TF statement false) and
// this exits 1 naming that section. Revert and it exits 0.
//
// Run: npm run gate:answer-distribution

import { ALL_EXAMS } from "../../src/lib/dk/registry";
import { getItems } from "../../src/lib/dk/items";

const CLUSTER = 0.6;      // a MULTI option index past this share is clustered (spread)
const BINARY_SKEW = 0.75; // a TRUE_FALSE value past this share is skewed (spread)
const MIN_N = 6;          // spread rule: below this a lean is as likely chance as design
const EXTREME_SKEW = 0.8; // one value at/above this share is gameable…
const EXTREME_MIN_N = 3;  // …at any section of at least this many answers (incl. all-same)

type Row = {
  section: string;
  taskType: string;
  axis: "position" | "value";
  n: number;
  share: number;
  top: string;
  rule: string | null;
};

const rows: Row[] = [];
let itemsSeen = 0;

/** Score one list of answer slots on one axis. `label` renders the winning value. */
function score(
  section: string,
  taskType: string,
  axis: "position" | "value",
  values: string[],
  binary: boolean,
  label: (v: string) => string,
): void {
  const n = values.length;
  if (n < EXTREME_MIN_N) return;
  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  let topKey = "";
  let topN = 0;
  for (const [k, v] of count) if (v > topN) [topKey, topN] = [k, v];
  const share = topN / n;
  const spread = n >= MIN_N && share > (binary ? BINARY_SKEW : CLUSTER);
  const extreme = share >= EXTREME_SKEW;
  const rule = spread
    ? binary ? "spread binary >75%" : "spread multi >60%"
    : extreme ? "extreme ≥80% @ n≥3"
    : null;
  rows.push({ section, taskType, axis, n, share, top: label(topKey), rule });
}

for (const e of ALL_EXAMS) {
  for (const skill of e.skills) {
    const items = getItems({ exam: e.exam, skill });
    itemsSeen += items.length;

    const positions = new Map<string, number[]>();
    const values = new Map<string, string[]>();
    const optionSets = new Map<string, Set<string>>();

    for (const it of items) {
      const a = it.answer;
      if (!a) continue;
      const p = (it.payload ?? {}) as { options?: string[]; gaps?: { id: number; options?: string[] }[] };

      if (a.type === "MCQ_SINGLE" || a.type === "TRUE_FALSE") {
        const t = a.type;
        (positions.get(t) ?? positions.set(t, []).get(t)!).push(a.correctIndex);
        const opts = p.options ?? [];
        (values.get(t) ?? values.set(t, []).get(t)!).push(String(opts[a.correctIndex] ?? "?"));
        (optionSets.get(t) ?? optionSets.set(t, new Set()).get(t)!).add([...opts].sort().join("|"));
      } else if (a.type === "CLOZE") {
        const arr = positions.get("CLOZE") ?? positions.set("CLOZE", []).get("CLOZE")!;
        const vals = values.get("CLOZE") ?? values.set("CLOZE", []).get("CLOZE")!;
        const sets = optionSets.get("CLOZE") ?? optionSets.set("CLOZE", new Set()).get("CLOZE")!;
        for (const c of a.correct) {
          arr.push(c.index);
          const g = (p.gaps ?? []).find((x) => x.id === c.id);
          const opts = g?.options ?? [];
          vals.push(String(opts[c.index] ?? "?"));
          sets.add([...opts].sort().join("|"));
        }
      }
      // MATCHING / ORDERING: not single-index gameable → out of scope for this rule.
    }

    const section = `${e.exam}::${skill}`;
    for (const [taskType, pos] of positions) {
      const binary = taskType === "TRUE_FALSE";
      score(section, taskType, "position", pos.map(String), binary, (v) => `idx ${v}`);

      // VALUE axis only where the option texts are shared across the whole section —
      // otherwise "always answer X" is not a strategy and this would invent findings.
      const sets = optionSets.get(taskType);
      if (sets && sets.size === 1) {
        score(section, taskType, "value", values.get(taskType) ?? [], binary, (v) => `"${v}"`);
      }
    }
  }
}

// ── FAIL ON ZERO ────────────────────────────────────────────────────────────────
if (itemsSeen === 0 || rows.length === 0) {
  console.error(
    `\n✗ ANSWER-DISTRIBUTION GATE FAILED — scanned ${itemsSeen} item(s) and produced ${rows.length} section(s).\n` +
    `  A gate that measures nothing is not a gate that found nothing. Either the bundles did not load,\n` +
    `  the registry returned no surfaces, or the answer shapes changed and this rule no longer recognises\n` +
    `  them. Treat as UNPROVEN, never as clean.\n`,
  );
  process.exit(1);
}

const flagged = rows.filter((r) => r.rule !== null).sort((a, b) => b.share - a.share);

if (flagged.length > 0) {
  const byAxis = (ax: string) => flagged.filter((f) => f.axis === ax).length;
  console.error(
    `\n✗ ANSWER-DISTRIBUTION GATE FAILED — ${flagged.length} of ${rows.length} scanned distributions are gameable ` +
    `(${byAxis("position")} by position, ${byAxis("value")} by value).\n`,
  );
  for (const r of flagged) {
    console.error(
      `  ${String(Math.round(r.share * 100)).padStart(3)}% → ${r.top.padEnd(14)} ${r.section}::${r.taskType}` +
      `  [${r.axis}]  (n=${r.n}, ${r.rule})`,
    );
  }
  console.error(
    `\n  Fix the BANK, not this threshold.\n` +
    `    position → npx tsx scripts/items/degame-options.mts  (permutes options, moves the key with them;\n` +
    `               it verifies the same option TEXT is still correct and writes nothing if not)\n` +
    `    value    → rewrite statements so some are genuinely TRUE of their own passage, as\n` +
    `               scripts/items/rebalance-truefalse.mts does — never flip a key to satisfy a count.\n` +
    `  An item must never be made wrong to balance a distribution.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ ANSWER-DISTRIBUTION GATE: ${itemsSeen} items, ${rows.length} distributions scanned ` +
  `(${rows.filter((r) => r.axis === "position").length} position, ${rows.filter((r) => r.axis === "value").length} value); ` +
  `nothing gameable.`,
);
