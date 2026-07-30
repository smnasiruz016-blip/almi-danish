// Server-authoritative grading for one practice attempt.
//
// The client posts an itemId and its response. Nothing else is believed. The item — and
// its answer key — is re-loaded here by id (getItemById), so a client-supplied key is
// never trusted and the key never has to ship in the served payload at all.
//
// WHAT THIS REPLACED. /api/dk/submit used to destructure `answer` straight off the
// request body and call `gradeObjective(answer, response)`. The browser posted the key
// and the server marked against it, so any POST could score 100% — and `maxPoints` came
// from the body too, so the client set both the score and its denominator. Every
// DanishAttempt.points ever written by that path was client-asserted. (In practice none
// were: the runner never sent an itemId, so the persistence branch was dead code — the
// grading was forgeable AND nothing was recorded.)
//
// The item's correct answer is returned to the CALLER, which decides whether to
// disclose it. On the practice path it is revealed after the learner commits; a mock
// route would withhold it. That split is decided by WHICH ROUTE runs, never by a
// client flag — a flag is just another thing the browser gets to choose.

import { hasPaidAccess } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { gradeObjective } from "@/lib/dk/grading";
import { getItemById } from "@/lib/dk/items";
import { isObjectiveTask, isFreeSkill } from "@/lib/dk/types";
import type { ObjectiveAnswer } from "@/lib/dk/types";

type PaidUser = Parameters<typeof hasPaidAccess>[0] & { id: string };

/** EVERYTHING THE CLIENT MAY SAY: which item, what the learner did, and — for a
 *  productive task the learner grades themselves — their own honest rating.
 *  No key, no maxPoints, no taskType, no exam. Those are the server's to know. */
export interface AttemptBody {
  itemId?: string;
  response?: unknown;
  selfScore?: number | string | null;
}

export type GradeOutcome =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      points: number;
      maxPoints: number;
      correct: boolean;
      selfScore: number | string | null;
      /** The item's correct answer — callers reveal this ONLY on the practice path. */
      correctAnswer: ObjectiveAnswer | null;
    };

export async function gradeAttempt(body: AttemptBody, user: PaidUser): Promise<GradeOutcome> {
  const itemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!itemId) return { ok: false, status: 400, error: "Missing itemId" };

  const item = getItemById(itemId);
  if (!item) return { ok: false, status: 404, error: "Unknown item" };

  // Derived from the SERVER-LOADED item, not from the request. These drove the paid
  // gate as well as the scoring, so a client that declared `skill: "READING"` on a
  // productive task used to walk straight through the Pro check.
  const objective = isObjectiveTask(item.taskType);
  const productive = !objective || !isFreeSkill(item.skill);

  if (productive && !hasPaidAccess(user)) {
    return { ok: false, status: 402, error: "Productive feedback is a Pro feature" };
  }

  let points = 0;
  let maxPoints = 0;
  let correct = false;
  let readiness: string | null = null;
  const selfScore = body.selfScore ?? null;

  if (objective && item.answer) {
    // Graded against the SERVER-held key. The response is the only thing from the body.
    const graded = gradeObjective(item.answer, body.response);
    points = graded.points;
    maxPoints = graded.maxPoints;
    correct = maxPoints > 0 && points === maxPoints;
    readiness = correct ? "CLEAR" : "BELOW";
  } else {
    readiness = typeof selfScore === "string" ? selfScore : null;
  }

  // Persistence uses the VALIDATED id: by this point it has resolved to a real served
  // item, so an attempt row cannot record an id the bank does not have. Best-effort —
  // a database failure must not cost the learner their result.
  try {
    await prisma.danishAttempt.create({
      data: {
        userId: user.id,
        itemId,
        status: objective ? "SCORED" : "EVALUATED",
        response: (body.response ?? { selfScore }) as object,
        points: objective ? points : null,
        maxPoints: objective ? maxPoints : null,
        readiness,
        submittedAt: new Date(),
      },
    });
  } catch {
    // attempts are optional this pass
  }

  return { ok: true, points, maxPoints, correct, selfScore, correctAnswer: objective ? item.answer : null };
}
