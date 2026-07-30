// Shared client-side item shapes handed from the runner pages to the practice
// components. Payloads stay `unknown` and are narrowed by taskType at render.

import type {
  DanishExam,
  DanishSkill,
  DanishTaskType,
  CefrLevel,
  ObjectiveAnswer,
} from "@/lib/dk/types";

export interface RunnerItem {
  /** Stable server id (hash of track|exam|skill|title). Posted back so the server
   *  re-loads the item and grades against its OWN key — the answer never ships. */
  id: string;
  title: string;
  prompt: string;
  exam: DanishExam;
  skill: DanishSkill;
  taskType: DanishTaskType;
  /** CEFR level this task is pitched at — carried so the runner can band readiness
   *  from at-goal tasks only. It is NOT what the AI grader is judged against: that
   *  level is read off the server-loaded item, because a level the client states is a
   *  level the client chooses. */
  cefr?: CefrLevel;
  payload: unknown;
  maxPoints: number;
  // NO `answer` FIELD, AND THAT IS THE POINT.
  //
  // This interface used to carry `answer: ObjectiveAnswer | null`, so every practice
  // page shipped its answer keys into the browser — readable in the page source before
  // the learner had answered anything. The runner then posted that same key back to
  // /api/dk/submit, which graded against it. The two halves were one defect: the key
  // leaked BECAUSE the server needed the client to send it back, and the server trusted
  // it BECAUSE it had no id to re-load by.
  //
  // `id` above replaces it. If you find yourself wanting `answer` here again, the thing
  // you actually need is a server route that loads the item by that id.
}

/** The productive composer never had a key to carry; it now carries the id so the
 *  grader can find the task itself. */
export type ProductiveItem = Omit<RunnerItem, "maxPoints">;

export interface SubmitResult {
  ok: boolean;
  points: number;
  maxPoints: number;
  correct: boolean;
  /** The correct answer, disclosed by the PRACTICE route only, after the learner has
   *  committed. It arrives in the response — it is no longer sitting in the page. */
  answer?: ObjectiveAnswer | null;
}

/** The BCP-47 voice tag for listening audio — Dutch (both tracks). */
export function ttsLang(): string {
  return "nl-NL";
}

/** POST an attempt to the submit API. DB-optional, never throws.
 *
 *  The body is TYPED rather than `unknown`, deliberately. Under the old shape this
 *  took `unknown` and the runner passed whatever it liked — which is how the answer key
 *  ended up in the request without anything objecting. A named type here means adding a
 *  task fact back to this call is a compile error, not a quiet regression. */
export async function submitAttempt(body: {
  itemId: string;
  response: unknown;
  selfScore?: number | string | null;
}): Promise<SubmitResult | null> {
  try {
    const res = await fetch("/api/dk/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as SubmitResult;
  } catch {
    return null;
  }
}

export type ProductiveBand = "CLEAR" | "BORDERLINE" | "BELOW";

export interface AiFeedback {
  band: ProductiveBand;
  summary: string;
  strengths: string[];
  improvements: string[];
}

export type GradeOutcome =
  | { status: "graded"; feedback: AiFeedback }
  | { status: "unavailable" } // key not provisioned / model hiccup → self-rate
  | { status: "error"; message: string };

/**
 * Request honest AI feedback on a productive answer. Returns "unavailable" (not
 * an error) when the key isn't provisioned yet, so the caller falls back to the
 * self-rating flow. Never throws.
 */
export async function gradeProductive(body: {
  /** Which task. The route re-loads it and reads the level, the criteria and the task
   *  text off the AUTHORED item.
   *
   *  This used to be `{exam, skill, taskType, cefr, title, prompt, criteria, response}`
   *  — the browser handing over the standard it was about to be marked against. Sending
   *  `cefr: "A1"` for a B1 task returned a confident CLEAR against the easier level, and
   *  a rewritten `criteria` array was accepted verbatim as "criteria the answer should
   *  meet". Two fields now, and neither can describe the task. */
  itemId: string;
  response: string;
}): Promise<GradeOutcome> {
  try {
    const res = await fetch("/api/dk/grade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as
      | ({ ok?: boolean; available?: boolean; error?: string } & Partial<AiFeedback>)
      | null;
    if (!res.ok || !data) {
      return { status: "error", message: data?.error ?? "Could not get feedback right now." };
    }
    if (data.available === false || !data.band) return { status: "unavailable" };
    return {
      status: "graded",
      feedback: {
        band: data.band,
        summary: data.summary ?? "",
        strengths: data.strengths ?? [],
        improvements: data.improvements ?? [],
      },
    };
  } catch {
    return { status: "unavailable" };
  }
}
