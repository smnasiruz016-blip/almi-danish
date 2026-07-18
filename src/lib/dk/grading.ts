// AlmiDanish scoring engine — per-skill READINESS estimate. Prøve i Dansk 3,
// the University of Denmark entrance exam and the CEFR levels are pass/fail against
// official criteria; we do NOT fabricate an official SIRI /
// Ministry result. We score each skill's objective items
// deterministically to a percentage and map it to an honest readiness band, and
// we label productive skills (Writing/Speaking) as AI estimates.

import { READY_PCT, BORDERLINE_PCT } from "./registry";
import type { ObjectiveAnswer, DanishTaskType, DanishSkill } from "./types";
import { isObjectiveTask } from "./types";
import { splitByLevel } from "@smnasiruz016-blip/almi-data";
import type { CefrLevel, LevelScored } from "@smnasiruz016-blip/almi-data";

export type Readiness = "CLEAR" | "BORDERLINE" | "BELOW";

export interface ObjectiveResult {
  points: number;
  maxPoints: number;
}

/** Deterministically grade one objective item's response against its key. */
export function gradeObjective(
  answer: ObjectiveAnswer,
  response: unknown,
): ObjectiveResult {
  switch (answer.type) {
    case "MCQ_SINGLE":
    case "TRUE_FALSE": {
      const picked = (response as { index?: number } | null)?.index;
      return { points: picked === answer.correctIndex ? 1 : 0, maxPoints: 1 };
    }
    case "MATCHING": {
      const picks = (response as { pairs?: [number, number][] } | null)?.pairs ?? [];
      const key = new Map(answer.pairs.map(([l, r]) => [l, r]));
      let pts = 0;
      for (const [l, r] of picks) if (key.get(l) === r) pts++;
      return { points: pts, maxPoints: answer.pairs.length };
    }
    case "CLOZE": {
      const picks = (response as { gaps?: { id: number; index: number }[] } | null)?.gaps ?? [];
      const key = new Map(answer.correct.map((c) => [c.id, c.index]));
      let pts = 0;
      for (const g of picks) if (key.get(g.id) === g.index) pts++;
      return { points: pts, maxPoints: answer.correct.length };
    }
    case "ORDERING": {
      const order = (response as { order?: number[] } | null)?.order ?? [];
      const correct =
        order.length === answer.order.length &&
        order.every((v, i) => v === answer.order[i]);
      return { points: correct ? 1 : 0, maxPoints: 1 };
    }
  }
}

/** Percentage → honest readiness band vs the level's real criteria. */
export function readinessFromPct(pct: number): Readiness {
  if (pct >= READY_PCT) return "CLEAR";
  if (pct >= BORDERLINE_PCT) return "BORDERLINE";
  return "BELOW";
}

export interface SkillReadout {
  skill: DanishSkill;
  points: number;
  maxPoints: number;
  pct: number;
  readiness: Readiness; // objective skills only; productive → estimate label
  isEstimate: boolean; // productive (Writing/Speaking) = AI estimate
}

export function skillReadout(
  skill: DanishSkill,
  points: number,
  maxPoints: number,
): SkillReadout {
  const pct = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
  const isEstimate = skill === "WRITING" || skill === "SPEAKING";
  return { skill, points, maxPoints, pct, readiness: readinessFromPct(pct), isEstimate };
}

/** Overall readiness LABEL for a percentage (honest, non-official framing). */
export function classificationLabel(pct: number): string {
  if (pct >= 85) return "Strong (practice estimate)";
  if (pct >= READY_PCT) return "On track (practice estimate)";
  if (pct >= BORDERLINE_PCT) return "Borderline (practice estimate)";
  return "Below level (practice estimate)";
}

/**
 * Aggregate a full mock's per-skill readouts into an overall readiness estimate.
 * Honest model: the official result is pass/fail per part against criteria, so we
 * take the mean objective percentage as an ORIENTATION estimate and flag the
 * weakest skill — never claim an official classification. We also surface whether
 * every graded skill reads CLEAR (the "ready across all four skills" shape).
 */
export function aggregateReadout(readouts: SkillReadout[]): {
  meanPct: number;
  overall: Readiness;
  label: string;
  weakest: DanishSkill | null;
  allClear: boolean;
} {
  const graded = readouts.filter((r) => r.maxPoints > 0);
  const meanPct = graded.length
    ? Math.round(graded.reduce((s, r) => s + r.pct, 0) / graded.length)
    : 0;
  let weakest: DanishSkill | null = null;
  let low = Infinity;
  for (const r of graded) if (r.pct < low) { low = r.pct; weakest = r.skill; }
  return {
    meanPct,
    overall: readinessFromPct(meanPct),
    label: classificationLabel(meanPct),
    weakest,
    allClear: graded.length > 0 && graded.every((r) => r.readiness === "CLEAR"),
  };
}

/** True when this task type is auto-gradable (objective). */
export function isObjectiveTaskType(t: DanishTaskType): boolean {
  return isObjectiveTask(t);
}

/**
 * Goal-readiness for an exam, banded from AT-GOAL tasks ONLY (via almi-data's
 * splitByLevel — the canonical level-crossing rule). A task's `cefr` decides where it
 * sits vs the exam's `goalCefr`; `difficulty` (FOUNDATION/CORE/STRETCH) NEVER does.
 *
 * Honest edges:
 *  - `atGoalPct === null` when the session served nothing at the goal → render
 *    "no estimate yet", never 0% (0% would lie about the learner, not the session).
 *  - foundational (below-goal) and above-goal tasks are reported as their own counts,
 *    not folded into the band — an easy below-goal win can't inflate goal-readiness,
 *    and a hard above-goal miss can't deflate it.
 */
export interface GoalReadout {
  goal: CefrLevel | undefined;
  atGoalPct: number | null;
  readiness: Readiness | null;
  atGoalCount: number;
  foundationalCount: number;
  aboveCount: number;
  undeclaredCount: number;
}

export function goalReadout(
  scored: readonly LevelScored[],
  goal: CefrLevel | undefined,
): GoalReadout {
  const s = splitByLevel(scored, goal);
  const atGoalPct =
    s.atGoal.maxPoints > 0
      ? Math.round((s.atGoal.points / s.atGoal.maxPoints) * 100)
      : null;
  return {
    goal: s.goal,
    atGoalPct,
    readiness: atGoalPct === null ? null : readinessFromPct(atGoalPct),
    atGoalCount: s.atGoal.count,
    foundationalCount: s.foundational.count,
    aboveCount: s.above.count,
    undeclaredCount: s.undeclared,
  };
}
