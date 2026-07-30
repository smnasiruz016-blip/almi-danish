// AI grading for the gated productive skills (Writing / Speaking). Sends the task
// + the learner's written answer to Sonnet and returns an HONEST practice
// readiness band (CLEAR / BORDERLINE / BELOW) with constructive, level-aware
// feedback against the exam's own criteria — never an official SIRI or Ministry result.
//
// Graceful degradation: if ANTHROPIC_API_KEY is not yet provisioned the route
// returns { ok: true, available: false } (HTTP 200) so the client falls back to
// the honest self-rating flow instead of surfacing a 500.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasPaidAccess } from "@/lib/billing/plans";
import { prisma } from "@/lib/prisma";
import { getAnthropicClient, recordCost } from "@/lib/ai/anthropic-client";
import { MODELS } from "@/lib/ai/models";
import { getItemById } from "@/lib/dk/items";
// ONE prompt assembly, shared with anything that needs to reason about this grader.
// Rebuilding it elsewhere would prove a grader that does not ship.
import { buildGradePrompt, parseFeedback } from "@/lib/dk/productive-prompt";
import type { AiFeedback } from "@/lib/dk/productive-prompt";

export const runtime = "nodejs";
export const maxDuration = 60;

/** EVERYTHING THE CLIENT MAY SAY. Two fields: which task, and what the learner wrote.
 *
 *  This interface used to carry exam, skill, taskType, cefr, title, prompt AND criteria,
 *  and the route graded against all of them. That made the browser the authority on the
 *  standard it was being judged by: a caller could send a B2 Prøve i Dansk 3 letter with
 *  `cefr: "A1"` and a rewritten criteria list, and the model would faithfully return a
 *  CLEAR band against the easier standard. Nothing in the response would look wrong —
 *  the feedback would be fluent, specific and confidently addressed to the level it had
 *  been handed. That is the failure mode that matters here: not a crash, a plausible
 *  wrong verdict, which a learner has no way to detect and every reason to believe.
 *
 *  The task now comes from the server-loaded item, keyed by id. The client cannot state
 *  the standard, only the answer. */
interface GradeBody {
  itemId?: string;
  response?: string;
}

function keyAvailable(): boolean {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && k.length >= 20 && k !== "TODO_FOUNDER_PROVIDES";
}

export async function POST(req: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // Productive AI feedback is the paid value (owner + comp bypass live inside).
  if (!hasPaidAccess(user)) {
    return NextResponse.json(
      { ok: false, error: "AI feedback is a Pro feature" },
      { status: 402 },
    );
  }

  let body: GradeBody;
  try {
    body = (await req.json()) as GradeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const response = (body.response ?? "").trim();
  if (response.length < 20) {
    return NextResponse.json(
      { ok: false, error: "Write a fuller answer before requesting feedback." },
      { status: 400 },
    );
  }

  // Key not provisioned yet → tell the client to fall back to self-rating.
  if (!keyAvailable()) {
    return NextResponse.json({ ok: true, available: false });
  }

  // ── SERVER-AUTHORITATIVE: the task is loaded by id, never taken from the body ──
  // getItemById reads the same bundles the runner serves, so the level, criteria, task
  // text and examiner persona all derive from authored content rather than from a
  // request anyone can shape.
  const itemId = (body.itemId ?? "").trim();
  if (!itemId) {
    return NextResponse.json({ ok: false, error: "Missing itemId" }, { status: 400 });
  }
  const item = getItemById(itemId);
  if (!item) {
    return NextResponse.json({ ok: false, error: "Unknown item" }, { status: 404 });
  }

  const { system, user: userMsg } = buildGradePrompt(item, response);

  let feedback: AiFeedback | null = null;
  try {
    const client = getAnthropicClient();
    const msg = await client.messages.create({
      model: MODELS.SONNET,
      max_tokens: 700,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: userMsg }],
    });

    await recordCost({
      userId: user.id,
      feature: "dk.grade.productive",
      model: MODELS.SONNET,
      usage: {
        inputTokens: msg.usage.input_tokens,
        outputTokens: msg.usage.output_tokens,
      },
      success: true,
    });

    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    feedback = parseFeedback(text);
  } catch (e) {
    await recordCost({
      userId: user.id,
      feature: "dk.grade.productive",
      model: MODELS.SONNET,
      usage: { inputTokens: 0, outputTokens: 0 },
      success: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    // Fall back to self-rating rather than 500 on a transient model error.
    return NextResponse.json({ ok: true, available: false });
  }

  if (!feedback) {
    return NextResponse.json({ ok: true, available: false });
  }

  // Persistence uses the VALIDATED id, not a raw body field: by this point itemId has
  // resolved to a real served item, so the attempt row cannot record an id the bank
  // does not have. (Under the old shape the client never sent one at all, so this
  // branch was dead code and no productive attempt was ever recorded.)
  try {
    await prisma.danishAttempt.create({
      data: {
        userId: user.id,
        itemId,
        status: "EVALUATED",
        response: { text: response } as object,
        aiFeedback: feedback as unknown as object,
        readiness: feedback.band,
        submittedAt: new Date(),
      },
    });
  } catch {
    // ignore — attempts are optional this pass
  }

  return NextResponse.json({ ok: true, available: true, ...feedback });
}
