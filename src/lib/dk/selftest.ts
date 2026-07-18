// Engine selftests — run with `npm run selftest:engine` (tsx).
// Proves the per-skill readiness bands and objective grading are correct.

import { gradeObjective, readinessFromPct, skillReadout, aggregateReadout, goalReadout } from "./grading";

let pass = 0;
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass++; } else { fail++; console.error(`✗ ${label}: got ${a}, want ${e}`); }
}

// ---- objective grading ----
eq(gradeObjective({ type: "MCQ_SINGLE", correctIndex: 2 }, { index: 2 }), { points: 1, maxPoints: 1 }, "mcq correct");
eq(gradeObjective({ type: "MCQ_SINGLE", correctIndex: 2 }, { index: 0 }), { points: 0, maxPoints: 1 }, "mcq wrong");
eq(gradeObjective({ type: "TRUE_FALSE", correctIndex: 1 }, { index: 1 }), { points: 1, maxPoints: 1 }, "tf correct");
eq(
  gradeObjective({ type: "MATCHING", pairs: [[0, 1], [1, 2], [2, 0]] }, { pairs: [[0, 1], [1, 2], [2, 2]] }),
  { points: 2, maxPoints: 3 },
  "matching partial",
);
eq(
  gradeObjective({ type: "CLOZE", correct: [{ id: 1, index: 0 }, { id: 2, index: 3 }] }, { gaps: [{ id: 1, index: 0 }, { id: 2, index: 1 }] }),
  { points: 1, maxPoints: 2 },
  "cloze partial",
);
eq(gradeObjective({ type: "ORDERING", order: [2, 0, 1] }, { order: [2, 0, 1] }), { points: 1, maxPoints: 1 }, "ordering correct");
eq(gradeObjective({ type: "ORDERING", order: [2, 0, 1] }, { order: [0, 1, 2] }), { points: 0, maxPoints: 1 }, "ordering wrong");

// ---- readiness bands (BORDERLINE 55 / CLEAR 70) ----
eq(readinessFromPct(85), "CLEAR", "band 85");
eq(readinessFromPct(70), "CLEAR", "band 70 floor");
eq(readinessFromPct(69), "BORDERLINE", "band 69");
eq(readinessFromPct(55), "BORDERLINE", "band 55 floor");
eq(readinessFromPct(54), "BELOW", "band 54");
eq(readinessFromPct(0), "BELOW", "band 0");

// productive skills flagged as estimate
eq(skillReadout("WRITING", 0, 0).isEstimate, true, "writing is estimate");
eq(skillReadout("READING", 8, 10).isEstimate, false, "reading not estimate");
eq(skillReadout("READING", 8, 10).readiness, "CLEAR", "reading 80% clear");

// aggregate: weakest skill + mean + all-clear
{
  const agg = aggregateReadout([
    skillReadout("READING", 9, 10), // 90
    skillReadout("LISTENING", 5, 10), // 50 (weakest)
  ]);
  eq(agg.meanPct, 70, "agg mean");
  eq(agg.weakest, "LISTENING", "agg weakest");
  eq(agg.overall, "CLEAR", "agg overall 70");
  eq(agg.allClear, false, "agg not all clear (listening below)");
}
{
  const agg = aggregateReadout([
    skillReadout("READING", 9, 10),
    skillReadout("LISTENING", 8, 10),
  ]);
  eq(agg.allClear, true, "agg all clear");
}

// ---- goal-readiness bands from AT-GOAL tasks only (PD3 goal = B2) ----
{
  // A poor B2 (at-goal) result next to a perfect B1 (foundational) win.
  // Blended, this is 13/20 = 65% (BORDERLINE) — inflated by the below-goal win.
  // Goal-readiness must band the B2 tasks ONLY: 3/10 = 30% (BELOW).
  const r = goalReadout(
    [
      { cefr: "B2", points: 3, maxPoints: 10 }, // at-goal, poor
      { cefr: "B1", points: 10, maxPoints: 10 }, // foundational, perfect
    ],
    "B2",
  );
  eq(r.atGoalPct, 30, "goal atGoal only (not blended to 65)");
  eq(r.readiness, "BELOW", "goal band BELOW from at-goal");
  eq(r.foundationalCount, 1, "goal foundational counted separately");
  eq(r.atGoalCount, 1, "goal at-goal count");
}
{
  // No at-goal tasks served → no honest estimate (null), NEVER 0%.
  const r = goalReadout([{ cefr: "B1", points: 2, maxPoints: 10 }], "B2");
  eq(r.atGoalPct, null, "goal no-at-goal → null pct");
  eq(r.readiness, null, "goal no-at-goal → null readiness");
  eq(r.foundationalCount, 1, "goal only-foundational counted");
}
{
  // Untagged task is UNDECLARED — never silently counted as at-goal.
  const r = goalReadout([{ points: 5, maxPoints: 10 }], "B2");
  eq(r.atGoalPct, null, "goal undeclared → null (not at-goal)");
  eq(r.undeclaredCount, 1, "goal undeclared counted");
}

console.log(`\nAlmiDanish engine selftest: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
