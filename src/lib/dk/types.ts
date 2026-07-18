// AlmiDanish — shared type contracts for the four-track item bank.
// String-literal unions mirror the Prisma enums (kept in sync by hand) so the
// scoring engine, content pipeline, and UI don't depend on the generated client.

// The "Choose a Test" tree is organised by the user's GOAL, not by the exam name.
// Citizenship and permanent residence each pair a Prøve i Dansk language exam
// with a knowledge test (as the Danish rules actually require).
export type DanishTrack =
  | "CITIZENSHIP" // → Prøve i Dansk 3 + Indfødsretsprøven
  | "PERMANENT_RESIDENCE" // → Prøve i Dansk 2 + Medborgerskabsprøven
  | "GETTING_STARTED" // → Prøve i Dansk 1
  | "UNIVERSITY"; // → Studieprøven

// The Prøve i Dansk language ladder (four language skills each), delivered under
// the Ministry of Immigration and Integration.
export type LanguageExam = "PD1" | "PD2" | "PD3" | "STUDIEPROVEN";
// Knowledge tests (Danish society / active citizenship) — multiple-choice only,
// a single KNOWLEDGE module rather than four language skills.
export type KnowledgeExam = "INDFODSRETSPROVEN" | "MEDBORGERSKABSPROVEN";
export type DanishExam = LanguageExam | KnowledgeExam;

// The four language skills are shared by all Prøve i Dansk exams; KNOWLEDGE is the
// single objective module used by the two knowledge tests.
export type LanguageSkill = "READING" | "LISTENING" | "WRITING" | "SPEAKING";
export type DanishSkill = LanguageSkill | "KNOWLEDGE";

export type DanishTaskType =
  | "MCQ_SINGLE"
  | "MATCHING"
  | "CLOZE"
  | "ORDERING"
  | "TRUE_FALSE"
  | "WRITING_PROMPT"
  | "SPEAKING_PROMPT";

export type DanishDifficulty = "FOUNDATION" | "CORE" | "STRETCH";

// The CEFR level a single task is PITCHED at — distinct from `difficulty`, which is a
// FOUNDATION/CORE/STRETCH ladder *inside* an exam and crosses levels freely. Level is
// what the goal-readiness band keys on (via almi-data's splitByLevel); difficulty is
// only for ordering/variety. Optional: an untagged task is UNDECLARED and never
// silently counted as at-goal. Re-exported CefrLevel from the canonical rule package.
export type { CefrLevel } from "@smnasiruz016-blip/almi-data";

export const OBJECTIVE_TASK_TYPES: DanishTaskType[] = [
  "MCQ_SINGLE",
  "MATCHING",
  "CLOZE",
  "ORDERING",
  "TRUE_FALSE",
];

export const PRODUCTIVE_TASK_TYPES: DanishTaskType[] = [
  "WRITING_PROMPT",
  "SPEAKING_PROMPT",
];

export function isObjectiveTask(t: DanishTaskType): boolean {
  return OBJECTIVE_TASK_TYPES.includes(t);
}

/** A skill is "free to taste" (auto-graded) vs gated (AI-graded / mock).
 *  Free taste = Reading + Listening + Knowledge (all objective, auto-graded).
 *  Gated = Writing + Speaking (AI-graded) + the full mock. */
export function isFreeSkill(skill: DanishSkill): boolean {
  return skill === "READING" || skill === "LISTENING" || skill === "KNOWLEDGE";
}

// ---- Task payload shapes (validated in items.ts) ----

/** One multiple-choice / true-false option group. */
export interface McqPayload {
  passage?: string; // reading passage (READING) — omitted for LISTENING
  transcript?: string; // listening transcript (LISTENING) — rendered as audio via TTS
  question: string;
  options: string[]; // 3–4 options
}

export interface MatchingPayload {
  transcript?: string;
  passage?: string;
  instructions: string;
  left: string[]; // prompts
  right: string[]; // candidate matches (may include distractors)
}

export interface ClozePayload {
  passage: string; // text with {{1}} {{2}} … gap markers
  gaps: { id: number; options: string[] }[];
}

export interface OrderingPayload {
  instructions: string;
  items: string[]; // presented shuffled; answer = correct order of indices
}

/** Objective answer keys keyed by taskType. */
export type ObjectiveAnswer =
  | { type: "MCQ_SINGLE"; correctIndex: number }
  | { type: "TRUE_FALSE"; correctIndex: number }
  | { type: "MATCHING"; pairs: [number, number][] } // [leftIndex, rightIndex]
  | { type: "CLOZE"; correct: { id: number; index: number }[] }
  | { type: "ORDERING"; order: number[] };

/** Productive prompt (Writing / Speaking) — AI-graded. */
export interface ProductivePayload {
  stimulus?: string; // context / situation (DA)
  criteria: string[]; // what the answer must show (feeds AI feedback)
  charBand?: { min: number; max: number }; // writing length guidance
  minSeconds?: number; // speaking guidance
}
