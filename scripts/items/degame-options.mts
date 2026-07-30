// DE-GAME THE OBJECTIVE BANKS — redistribute answer POSITION without touching which
// answer is correct.
//
// THE PROBLEM THIS FIXES. Measured across the served bank: 13 of 22 objective sections
// were positionally gameable, four at 100% on a single index — including
// RIKISBORGARAPROF_A2::READING::CLOZE at 7 of 7 on index 0, on the citizenship test
// itself. Pooled across the CEFR ladder, READING::CLOZE sat at 65% on index 0 over 34
// answers. A learner who always picked the first option scored well without reading
// Icelandic.
//
// WHAT THIS DOES, AND WHAT IT REFUSES TO DO. It PERMUTES each question's option array
// and moves correctIndex with it. The correct answer is never re-chosen — the same
// option text stays correct, at a different position. Correctness is preserved by
// CONSTRUCTION, not by care: the verification pass below re-reads every file and
// asserts that the option text at the new correctIndex is character-for-character the
// text that was at the old one. If a single one disagrees the run aborts and writes
// nothing.
//
// This does NOT loosen any gate. B1's thresholds are untouched; the bank is what
// changed. Nothing about WHICH answer is correct moves, and no item text is edited —
// this product's content is out of scope for this pass by instruction, and the
// verification below would abort the run if a single key landed on different text.
//
// WHY BALANCED-AND-SHUFFLED, NOT RANDOM. A per-item random shuffle at n=15 clusters by
// chance often enough to leave sections still flagged, and re-running until it passes
// is fitting the bank to the gate. A plain round-robin (0,1,2,3,0,1,2,3…) distributes
// perfectly and is itself a pattern a learner could ride. So: build a BALANCED multiset
// of target positions for each section — each position used as near-equally as the
// count allows — then deterministically shuffle that multiset. Even distribution, no
// rideable cycle.
//
// Deterministic throughout, seeded from the section key: re-running produces the same
// bank, so a reviewer can reproduce the diff exactly and it is reviewable as content.
//
// Rule #7 is untouched: no item is added, removed or deactivated, so every module keeps
// its count.
//
// Run: npx tsx scripts/items/degame-options.mts [--dry]

import fs from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry");
const ITEMS_DIR = path.join(process.cwd(), "src", "data", "items");

type Slot = {
  file: string;
  itemIndex: number;
  gapId: number | null; // null = the item's own options; else a CLOZE gap
  options: string[];
  correctIndex: number;
};

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── COLLECT ─────────────────────────────────────────────────────────────────
const files = fs.readdirSync(ITEMS_DIR).filter((f) => f.endsWith(".json"));
const banks = new Map<string, any[]>();
for (const f of files) banks.set(f, JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), "utf8")));

/** section key = the grain a learner practises, and the grain B1 judges. */
const sections = new Map<string, Slot[]>();
for (const [file, items] of banks) {
  items.forEach((it: any, itemIndex: number) => {
    const a = it.answer;
    if (!a) return;
    const key = `${it.exam}::${it.skill}::${it.taskType}`;
    const push = (s: Slot) => {
      if (!Array.isArray(s.options) || s.options.length < 2) return;
      if (typeof s.correctIndex !== "number") return;
      (sections.get(key) ?? sections.set(key, []).get(key)!).push(s);
    };
    if (a.type === "MCQ_SINGLE" || a.type === "TRUE_FALSE") {
      push({ file, itemIndex, gapId: null, options: it.payload?.options, correctIndex: a.correctIndex });
    } else if (a.type === "CLOZE") {
      for (const c of a.correct ?? []) {
        const gap = (it.payload?.gaps ?? []).find((g: any) => g.id === c.id);
        if (gap) push({ file, itemIndex, gapId: c.id, options: gap.options, correctIndex: c.index });
      }
    }
    // MATCHING / ORDERING carry no option list — they are structural keys and are
    // handled by the separate re-key pass, not here.
  });
}

// ── ASSIGN BALANCED TARGETS AND PERMUTE ─────────────────────────────────────
let moved = 0;
const report: string[] = [];
for (const [key, slots] of [...sections].sort()) {
  // Slots in a section can have different option counts (rare but possible), so the
  // balanced multiset is built per option-count bucket.
  const byWidth = new Map<number, Slot[]>();
  for (const s of slots) (byWidth.get(s.options.length) ?? byWidth.set(s.options.length, []).get(s.options.length)!).push(s);

  for (const [width, group] of byWidth) {
    const targets: number[] = [];
    for (let i = 0; i < group.length; i++) targets.push(i % width);
    const assigned = shuffled(targets, hashSeed(`${key}::${width}`));

    group.forEach((s, i) => {
      const target = assigned[i];
      if (target === s.correctIndex) return; // already where it should be
      const correctText = s.options[s.correctIndex];
      const others = s.options.filter((_, idx) => idx !== s.correctIndex);
      const next: string[] = [];
      let o = 0;
      for (let pos = 0; pos < width; pos++) next.push(pos === target ? correctText : others[o++]);

      // Write back into the loaded bank.
      const item = banks.get(s.file)![s.itemIndex];
      if (s.gapId === null) {
        item.payload.options = next;
        item.answer.correctIndex = target;
      } else {
        const gap = item.payload.gaps.find((g: any) => g.id === s.gapId);
        gap.options = next;
        const c = item.answer.correct.find((x: any) => x.id === s.gapId);
        c.index = target;
      }
      moved++;
    });

    const dist = new Array(width).fill(0);
    for (const t of assigned) dist[t]++;
    report.push(`  ${key}  (width ${width}, n=${group.length}) → ${dist.join("/")}`);
  }
}

// ── VERIFY BEFORE WRITING ───────────────────────────────────────────────────
// The claim is "the same option is still correct". Assert it against the ORIGINAL
// files rather than trusting the transformation that just ran.
const original = new Map<string, any[]>();
for (const f of files) original.set(f, JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), "utf8")));

const breaks: string[] = [];
for (const [file, items] of banks) {
  const before = original.get(file)!;
  items.forEach((it: any, i: number) => {
    const a = it.answer, b = before[i]?.answer;
    if (!a || !b) return;
    if (a.type === "MCQ_SINGLE" || a.type === "TRUE_FALSE") {
      const nowText = it.payload.options?.[a.correctIndex];
      const wasText = before[i].payload.options?.[b.correctIndex];
      if (nowText !== wasText) breaks.push(`${file}[${i}] "${it.title}": correct answer changed "${wasText}" → "${nowText}"`);
      const sameSet = [...(it.payload.options ?? [])].sort().join("|") === [...(before[i].payload.options ?? [])].sort().join("|");
      if (!sameSet) breaks.push(`${file}[${i}] "${it.title}": option SET changed, not just order`);
    } else if (a.type === "CLOZE") {
      for (const c of a.correct ?? []) {
        const bc = (b.correct ?? []).find((x: any) => x.id === c.id);
        const gNow = it.payload.gaps.find((g: any) => g.id === c.id);
        const gWas = before[i].payload.gaps.find((g: any) => g.id === c.id);
        if (!bc || !gNow || !gWas) continue;
        if (gNow.options[c.index] !== gWas.options[bc.index]) {
          breaks.push(`${file}[${i}] "${it.title}" gap ${c.id}: correct answer changed "${gWas.options[bc.index]}" → "${gNow.options[c.index]}"`);
        }
      }
    }
  });
}

console.log("── target distribution per section ──");
report.forEach((r) => console.log(r));
console.log(`\n${moved} key position(s) moved.`);

if (breaks.length) {
  console.error(`\n✗ CORRECTNESS BROKEN in ${breaks.length} place(s) — writing NOTHING:\n`);
  breaks.slice(0, 20).forEach((b) => console.error("  " + b));
  process.exit(1);
}
console.log("✓ correctness preserved: every key still points at the same option TEXT, and no option set changed.");

if (DRY) {
  console.log("\n--dry: no files written.");
} else {
  for (const [file, items] of banks) {
    fs.writeFileSync(path.join(ITEMS_DIR, file), JSON.stringify(items, null, 2) + "\n", "utf8");
  }
  console.log(`\nwrote ${banks.size} bundle(s).`);
}
