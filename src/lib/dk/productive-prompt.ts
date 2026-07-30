// THE PRODUCTIVE-GRADING PROMPT — one assembly, derived entirely from the server-loaded
// item.
//
// WHY IT LIVES HERE RATHER THAN INLINE IN THE ROUTE. Two reasons, and the second is the
// one that matters.
//
// 1. Anything that re-creates this prompt elsewhere — a harness, a script, a test —
//    would be proving a grader that does not ship. Two copies agree on the day they are
//    written and drift silently afterwards. One assembly, both callers import it.
//
// 2. Pulling it out of the route is what makes the P0 fix REAL rather than cosmetic. The
//    old route read `body.cefr`, `body.title`, `body.prompt` and `body.criteria` and
//    interpolated them straight into the system and user messages, so the browser stated
//    the standard it was about to be judged against. Nothing here takes an argument that
//    could carry those: this function is handed an DanishItemSeed and a string, and
//    every fact in the prompt comes off the item. A future edit cannot quietly
//    re-introduce client trust without changing the signature.

import { ALL_EXAMS, examBySlug } from "@/lib/dk/registry";
import { isCefrLevel, levelInstruction } from "@smnasiruz016-blip/almi-data";
import type { CefrLevel } from "@smnasiruz016-blip/almi-data";
import type { DanishItemSeed } from "@/lib/dk/items";

export type Band = "CLEAR" | "BORDERLINE" | "BELOW";
export const BANDS: Band[] = ["CLEAR", "BORDERLINE", "BELOW"];

export interface AiFeedback {
  band: Band;
  summary: string;
  strengths: string[];
  improvements: string[];
}

/** The registry entry for an item, found by the item's OWN exam — never by a slug the
 *  caller supplied. A wrong examiner persona produces confident, fluent, wrong feedback
 *  rather than an error anyone would notice, and this bank spans six standards that are
 *  not interchangeable: the Prøve i Dansk ladder (PD1 getting-started, PD2 for permanent
 *  residence, PD3 for citizenship at B2), Studieprøven at C1 for university entry, and
 *  two SOCIETY-KNOWLEDGE tests — Indfødsretsprøven and Medborgerskabsprøven — which are
 *  not language exams at all and carry no CEFR level. */
export function examForItem(item: DanishItemSeed) {
  return ALL_EXAMS.find((e) => e.exam === item.exam) ?? examBySlug(String(item.exam));
}

/** The criteria the answer is judged against, off the AUTHORED payload.
 *  Never from a request: letting the caller supply these is letting it mark its own
 *  paper — and the old route did exactly that, joining `body.criteria` into a line
 *  headed "Criteria the answer should meet". */
export function criteriaOf(item: DanishItemSeed): string[] {
  const payload = (item.payload ?? {}) as { criteria?: unknown };
  return (Array.isArray(payload.criteria) ? payload.criteria : []).filter(
    (c): c is string => typeof c === "string" && c.trim().length > 0,
  );
}

/**
 * Build the system + user messages for one item and one learner answer.
 *
 * ── THE LEVEL, AND WHY THE FALLBACK MOSTLY DOES NOT RESOLVE HERE ────────────────
 * Preference is the TASK's own `cefr`, then the exam's. In AlmiIceland every exam label
 * is a single valid level, so the fallback always lands. DENMARK IS THE OPPOSITE CASE
 * and the sibling's reassurance must not be carried across:
 *
 *   PD1 "A1–A2"  ·  PD2 "A2–B1"  ·  Indfødsretsprøven / Medborgerskabsprøven
 *   "Knowledge test"       → isCefrLevel rejects all four, so no level is handed over
 *   PD3 "B2"  ·  Studieprøven "C1"  → resolve
 *
 * That is deliberate, not a bug to route around. A range is not a standard: the same
 * answer passes as A1 and fails as A2 depending where the model aims, so telling the
 * model there is no level is more honest than substituting a span no single task sits
 * at. Measured on this bank: 60 productive items (every PD1 and PD2 writing and
 * speaking task) reach the grader with no level and are judged against their own
 * criteria instead.
 *
 * Fixing that means declaring a level per item or a goalCefr per exam — a content-round
 * decision, deferred by instruction, and NOT something this file should paper over.
 */
export function buildGradePrompt(
  item: DanishItemSeed,
  response: string,
): { system: string; user: string; cefr: CefrLevel | null } {
  const exam = examForItem(item);
  const examName = exam?.name ?? "the Danish exam";
  const cefr: CefrLevel | null = isCefrLevel(item.cefr)
    ? (item.cefr as CefrLevel)
    : isCefrLevel(exam?.cefr)
      ? (exam!.cefr as CefrLevel)
      : null;
  const levelPhrase = cefr ?? "the task's own criteria";
  const isSpeaking = item.taskType === "SPEAKING_PROMPT";
  const criteria = criteriaOf(item);

  const system = [
    `You are an experienced Danish-language examiner for ${examName}.`,
    levelInstruction(cefr ?? undefined),
    `You give an HONEST practice readiness estimate against the task's own criteria — this is a study aid, never an official SIRI or Ministry result, and you never claim otherwise.`,
    isSpeaking
      ? `This is a SPEAKING task; the learner has typed the answer they would say aloud, so judge content, structure, range and appropriacy, not pronunciation.`
      : `This is a WRITING task; judge task fulfilment, coherence, range and accuracy at ${levelPhrase}.`,
    `Be constructive, specific and level-aware. Do not inflate. Reply with STRICT JSON only, no prose, no code fences, in this exact shape:`,
    `{"band":"CLEAR|BORDERLINE|BELOW","summary":"1-2 sentence honest estimate","strengths":["..."],"improvements":["..."]}`,
    `Bands: CLEAR = comfortably meets the criteria at ${levelPhrase}; BORDERLINE = partially meets them, could go either way; BELOW = does not yet meet them.`,
  ].join(" ");

  const user = [
    `Task: ${item.title}`,
    `Instructions: ${item.prompt}`,
    criteria.length ? `Criteria the answer should meet:\n- ${criteria.join("\n- ")}` : null,
    `\nLearner's answer:\n"""${response.slice(0, 6000)}"""`,
  ]
    .filter(Boolean)
    .join("\n");

  return { system, user, cefr };
}

/** Defensive JSON extraction — models occasionally wrap JSON in prose or fences. */
export function parseFeedback(raw: string): AiFeedback | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const o = obj as Partial<AiFeedback>;
  if (!o || typeof o !== "object") return null;
  if (!o.band || !BANDS.includes(o.band)) return null;
  return {
    band: o.band,
    summary: typeof o.summary === "string" ? o.summary : "",
    strengths: Array.isArray(o.strengths) ? o.strengths.filter((s): s is string => typeof s === "string") : [],
    improvements: Array.isArray(o.improvements) ? o.improvements.filter((s): s is string => typeof s === "string") : [],
  };
}
