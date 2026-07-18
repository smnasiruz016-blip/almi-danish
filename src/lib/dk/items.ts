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
