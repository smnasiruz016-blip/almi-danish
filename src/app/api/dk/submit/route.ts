// PRACTICE submit endpoint. Server-authoritative: the item — and its answer key — is
// re-loaded by id inside gradeAttempt() and graded against the SERVER key. The client
// posts only { itemId, response, selfScore } and a client-supplied answer is never
// trusted. On this PRACTICE path the correct answer IS returned, for the post-submit
// per-option reveal; a mock route would run the same grader and withhold it. That split
// is decided by which route runs, never by a client flag.
//
// WHAT THIS REPLACED, AND WHY IT WAS A P0. The route used to destructure `answer`
// straight off the body and call `gradeObjective(answer, response)` — the browser sent
// the key and the server marked against it, so any POST scored 100%. `maxPoints` came
// off the body too, so the client set both the numerator and the denominator. `skill`
// and `taskType` came off the body as well, which put the Pro gate in the caller's
// hands: declaring a productive task as a free skill walked straight through it.
//
// All four now come from the server-loaded item. The client cannot state the standard,
// only the answer.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gradeAttempt, type AttemptBody } from "@/lib/dk/grade-attempt";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  let body: AttemptBody;
  try {
    body = (await req.json()) as AttemptBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const r = await gradeAttempt(body, user);
  if (!r.ok) {
    return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  }

  // PRACTICE reveal: disclose the correct answer AFTER the learner has committed theirs.
  return NextResponse.json({
    ok: true,
    points: r.points,
    maxPoints: r.maxPoints,
    correct: r.correct,
    selfScore: r.selfScore,
    answer: r.correctAnswer,
  });
}
