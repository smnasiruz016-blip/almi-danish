// Bundled item loader for AlmiDanish practice.
//
// Items are authored as JSON bundles under src/data/items/*.json (one per
// surface). The content pipeline may still be generating them, so the loader is
// defensive: any missing, empty, or malformed file falls back to [] rather than
// throwing. Files are read from disk at module load (Node runtime) so we don't
// need every bundle to exist at build/tsc time.

import fs from "fs";
import path from "path";
import type {
  DanishTrack,
  DanishExam,
  DanishSkill,
  DanishTaskType,
  DanishDifficulty,
  CefrLevel,
  ObjectiveAnswer,
} from "./types";

/** A single authored item, matching the DanishItem content fields (no DB id). */
export interface DanishItemSeed {
  track: DanishTrack;
  exam: DanishExam;
  skill: DanishSkill;
  taskType: DanishTaskType;
  difficulty: DanishDifficulty;
  /** The CEFR level this task is pitched at (optional). Feeds the goal-readiness band
   *  and the level-aware AI grader. Absent = UNDECLARED (never counted as at-goal). */
  cefr?: CefrLevel;
  title: string;
  prompt: string;
  payload: unknown;
  answer: ObjectiveAnswer | null;
  maxPoints: number;
}

const BUNDLE_FILES = [
  // Prøve i Dansk ladder — reading / listening / productive (writing+speaking) per exam
  "pd1-reading.json",
  "pd1-listening.json",
  "pd1-productive.json",
  "pd1-productive-2.json",
  "pd2-reading.json",
  "pd2-listening.json",
  "pd2-productive.json",
  "pd2-productive-2.json",
  "pd3-reading.json",
  "pd3-listening.json",
  "pd3-productive.json",
  "pd3-productive-2.json",
  "studieproven-reading.json",
  "studieproven-listening.json",
  "studieproven-productive.json",
  "studieproven-productive-2.json",
  // Society / citizenship knowledge tests — single KNOWLEDGE (MCQ) module each
  "indfodsretsproven.json",
  "medborgerskabsproven.json",
];

const ITEMS_DIR = path.join(process.cwd(), "src", "data", "items");

function loadBundle(file: string): DanishItemSeed[] {
  try {
    const full = path.join(ITEMS_DIR, file);
    if (!fs.existsSync(full)) return [];
    const raw = fs.readFileSync(full, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as DanishItemSeed[];
  } catch {
    // Malformed / partially-written bundle — tolerate and skip.
    return [];
  }
}

let cache: DanishItemSeed[] | null = null;

function allItems(): DanishItemSeed[] {
  if (cache) return cache;
  cache = BUNDLE_FILES.flatMap(loadBundle);
  return cache;
}

/** Filtered item lookup by any combination of track / exam / skill. */
export function getItems(filter: {
  track?: DanishTrack;
  exam?: DanishExam;
  skill?: DanishSkill;
} = {}): DanishItemSeed[] {
  return allItems().filter(
    (it) =>
      (filter.track === undefined || it.track === filter.track) &&
      (filter.exam === undefined || it.exam === filter.exam) &&
      (filter.skill === undefined || it.skill === filter.skill),
  );
}

// ── SERVER-SIDE ITEM IDENTITY ───────────────────────────────────────────────
// Items are bundle-served with NO database id, and that absence was the ROOT of this
// product's grading P0: with nothing to re-load by, /api/dk/submit graded whatever
// answer key the browser posted and /api/dk/grade took the CEFR level, title, prompt and
// criteria off the request. An id has to exist before grading can be authoritative, so
// it is the first fix rather than a later hardening step.
//
// The id hashes the FULL identifying tuple — track|exam|skill|title — because titles are
// only unique within a surface. assertNoIdCollisions() proves that at build time; a
// collision would make getItemById() return the WRONG item and grade a learner against
// a different task's key, silently.

/** Stable, content-derived id for a bundle item — the handle the client posts back.
 *
 *  ── WHY THE TUPLE IS WIDER HERE THAN IN THE SIBLINGS ──────────────────────────
 *  Swiss, Dutch and Iceland hash track|exam|skill|title. That works there because their
 *  titles happen to be unique within a surface. THIS BANK HAS THREE COLLISIONS, and the
 *  collision gate caught them on its very first run, before any of this shipped:
 *
 *    GETTING_STARTED|PD1|SPEAKING|Talk about your family
 *    GETTING_STARTED|PD1|SPEAKING|Ask for directions
 *    UNIVERSITY|STUDIEPROVEN|WRITING|Summary of a research finding
 *
 *  Each pair is TWO GENUINELY DIFFERENT TASKS that happen to share a title — different
 *  prompts, different criteria — not redundant copies, so the modules honestly hold 15
 *  items and nothing needs deleting. But under a title-only id, getItemById() would
 *  return whichever came first and could grade a learner against the OTHER task's
 *  criteria. Silently, and plausibly.
 *
 *  Renaming three titles would also fix it and is the smaller diff, but it is a content
 *  edit and content is frozen this pass. Hashing the TASK DEFINITION instead needs no
 *  content change at all.
 *
 *  The hash deliberately excludes the answer key, the option list and anything the
 *  de-game or structural re-key passes touch, so those passes do NOT churn item ids.
 *  It does include prompt and criteria — so editing what a task ASKS mints a new id,
 *  which is the correct behaviour: an attempt recorded against the old wording was an
 *  attempt at a different task. */
export function stableItemId(
  it: Pick<DanishItemSeed, "track" | "exam" | "skill" | "title" | "prompt" | "taskType" | "payload">,
): string {
  const criteria = ((it.payload ?? {}) as { criteria?: unknown }).criteria;
  const definition = [
    it.track, it.exam, it.skill, it.taskType, it.title, it.prompt,
    Array.isArray(criteria) ? criteria.join("¶") : "",
  ].join("|");
  return hashSeed(definition).toString(36);
}

/** Re-load the full item, INCLUDING its answer key, by its stable id — server-side only.
 *  This is the function that makes grading authoritative: the route calls it instead of
 *  believing the request. */
export function getItemById(id: string): DanishItemSeed | undefined {
  return allItems().find((it) => stableItemId(it) === id);
}

/**
 * Build-time guard: no two items may share a stable id. A collision would grade a
 * learner's answer against a DIFFERENT item's key, with no error and a plausible score.
 *
 * SEEN RED: duplicate a (track,exam,skill,title) tuple in any bundle and this throws.
 */
export function assertNoIdCollisions(): void {
  const seen = new Map<string, string>();
  for (const it of allItems()) {
    const id = stableItemId(it);
    const key = `${it.track}|${it.exam}|${it.skill}|${it.title}`;
    const prior = seen.get(id);
    if (prior) {
      throw new Error(
        `stableItemId collision: "${key}" and "${prior}" both hash to ${id} — grading would key against the wrong item`,
      );
    }
    seen.set(id, key);
  }
}

/**
 * Deterministic stable string hash → 32-bit int. Used as a fallback seed so the
 * pick is varied but reproducible without Math.random at module/build scope.
 */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG (mulberry32) for a stable shuffle from a numeric seed. */
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

function stableShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deterministically pick up to n practice items for an exam + skill. With no
 * seed the natural (authored) order is preserved; a numeric seed produces a
 * stable reshuffle for variety. Never uses Math.random.
 */
export function pickPractice(
  exam: DanishExam,
  skill: DanishSkill,
  n: number,
  seed?: number,
): DanishItemSeed[] {
  const pool = getItems({ exam, skill });
  const ordered =
    seed === undefined
      ? pool
      : stableShuffle(pool, seed ^ hashSeed(`${exam}:${skill}`));
  return ordered.slice(0, Math.max(0, n));
}
