// AlmiDanish — the "Choose a Test" tree + exam metadata.
// Four goal-based tracks → exams → skills. Drives navigation, content filtering,
// and the honest readiness thresholds used by the scoring engine. All "pass"
// figures are framed as READINESS estimates, never the official SIRI / Ministry
// result.

import type {
  DanishTrack,
  DanishExam,
  LanguageExam,
  KnowledgeExam,
  DanishSkill,
  LanguageSkill,
  CefrLevel,
} from "./types";

export interface ExamMeta {
  exam: DanishExam;
  track: DanishTrack;
  slug: string; // URL slug
  name: string; // display name (official Danish exam name)
  cefr: string; // CEFR level label, or "Knowledge test" for the MCQ tests
  // The single CEFR level a learner's readiness for THIS exam is banded against —
  // its verified at-goal standard. Distinct from `cefr` (a display string that may be
  // a range). Absent when the exam has no single language pass level (the knowledge
  // tests). Feeds almi-data's splitByLevel: only at-goal tasks count toward the band.
  goalCefr?: CefrLevel;
  blurb: string; // one-line description
  skills: DanishSkill[];
  knowledge?: boolean; // true = society/citizenship MCQ test (single KNOWLEDGE module)
  lead?: boolean; // citizenship-relevant (Prøve i Dansk 3) — the lead hook
  mockMinutes: number; // full timed mock duration guidance
}

// The exams are administered under the Ministry of Immigration and Integration;
// residency and citizenship applications are handled by SIRI. We never present a
// practice score as an official result from either.
export const AUTHORITY = {
  ministry: "Ministry of Immigration and Integration",
  agency: "SIRI (Styrelsen for International Rekruttering og Integration)",
} as const;

// Citizenship / residency framing — hedged on purpose. The rules shift, so we
// point people to SIRI rather than stating fixed residency years or implying a
// shortcut.
export const CITIZENSHIP_HEDGE =
  "Danish citizenship commonly requires Prøve i Dansk 3 and the Indfødsretsprøven, alongside residency and other conditions. The rules change over time — confirm the current requirements with SIRI before you plan.";
export const RESIDENCE_HEDGE =
  "Permanent residence commonly requires Prøve i Dansk 2 and the Medborgerskabsprøven, alongside residency, employment and other conditions. Confirm the current rules with SIRI.";

// Per-skill readiness thresholds (honest). The exams are pass/fail against
// official criteria; we show a per-skill readiness band as an estimate, clearly
// labelled — never an official SIRI / Ministry result.
export const READY_PCT = 70; // CLEAR — comfortably meeting the level's demands
export const BORDERLINE_PCT = 55; // BORDERLINE — close, needs consolidation

export const LANGUAGE_SKILLS: LanguageSkill[] = ["READING", "LISTENING", "WRITING", "SPEAKING"];

export const SKILL_LABELS: Record<DanishSkill, { da: string; en: string }> = {
  READING: { da: "Læseforståelse", en: "Reading" },
  LISTENING: { da: "Lytteforståelse", en: "Listening" },
  WRITING: { da: "Skriftlig fremstilling", en: "Writing" },
  SPEAKING: { da: "Mundtlig kommunikation", en: "Speaking" },
  KNOWLEDGE: { da: "Samfundskundskab", en: "Knowledge" },
};

// Track A — Prøve i Dansk ladder. Prøve i Dansk 3 (citizenship, B1–B2) is the
// lead hook: it is the language exam commonly required for Danish citizenship.
// The Indfødsretsprøven (Danish society knowledge) is required in addition to it.
export const LANGUAGE_EXAMS: ExamMeta[] = [
  {
    exam: "PD1", track: "GETTING_STARTED", slug: "prove-i-dansk-1", name: "Prøve i Dansk 1", cefr: "A1–A2",
    blurb: "The first step on the Prøve i Dansk ladder — everyday Danish for work and family life.",
    skills: ["READING", "LISTENING", "WRITING", "SPEAKING"], mockMinutes: 150,
  },
  {
    exam: "PD2", track: "PERMANENT_RESIDENCE", slug: "prove-i-dansk-2", name: "Prøve i Dansk 2", cefr: "A2–B1",
    blurb: "The A2–B1 Danish exam commonly required for permanent residence — Reading, Listening, Written Presentation and Speaking.",
    skills: ["READING", "LISTENING", "WRITING", "SPEAKING"], mockMinutes: 180,
  },
  {
    exam: "PD3", track: "CITIZENSHIP", slug: "prove-i-dansk-3", name: "Prøve i Dansk 3", cefr: "B2", goalCefr: "B2",
    blurb: "The B2 Danish exam commonly required for Danish citizenship — Reading, Listening, Written Presentation and Speaking.",
    skills: ["READING", "LISTENING", "WRITING", "SPEAKING"], lead: true, mockMinutes: 240,
  },
  {
    exam: "STUDIEPROVEN", track: "UNIVERSITY", slug: "studieproven", name: "Studieprøven", cefr: "C1",
    blurb: "The advanced (≈C1) Danish exam for admission to Danish-taught university programmes.",
    skills: ["READING", "LISTENING", "WRITING", "SPEAKING"], mockMinutes: 300,
  },
];

// Track B — Danish society / active-citizenship knowledge tests. Multiple-choice,
// not language proficiency. Indfødsretsprøven is required for citizenship in
// addition to Prøve i Dansk 3; Medborgerskabsprøven is the permanent-residence /
// active-citizenship knowledge test.
export const KNOWLEDGE_EXAMS: ExamMeta[] = [
  {
    exam: "INDFODSRETSPROVEN", track: "CITIZENSHIP", slug: "indfodsretsproven", name: "Indfødsretsprøven", cefr: "Knowledge test",
    blurb: "The Danish citizenship knowledge test — society, history and culture, in multiple-choice form. Required for citizenship in addition to Prøve i Dansk 3.",
    skills: ["KNOWLEDGE"], knowledge: true, mockMinutes: 30,
  },
  {
    exam: "MEDBORGERSKABSPROVEN", track: "PERMANENT_RESIDENCE", slug: "medborgerskabsproven", name: "Medborgerskabsprøven", cefr: "Knowledge test",
    blurb: "The active-citizenship knowledge test used on the permanent-residence path — everyday Danish society, in multiple-choice form.",
    skills: ["KNOWLEDGE"], knowledge: true, mockMinutes: 30,
  },
];

export const ALL_EXAMS: ExamMeta[] = [...LANGUAGE_EXAMS, ...KNOWLEDGE_EXAMS];

// The goal-based "Choose a Test" tree. Each track is a reason someone studies
// Danish; the exams under it are what that goal commonly requires.
export interface TrackMeta {
  track: DanishTrack;
  label: string; // short UI label
  goal: string; // what this path is for
  requires: string; // the exams commonly required, in plain words
  examSlugs: string[]; // ordered exam slugs for this track
  lead?: boolean;
}

export const TRACKS: TrackMeta[] = [
  {
    track: "CITIZENSHIP", label: "Danish citizenship", goal: "Working toward Danish citizenship",
    requires: "Prøve i Dansk 3 (B1–B2) + Indfødsretsprøven",
    examSlugs: ["prove-i-dansk-3", "indfodsretsproven"], lead: true,
  },
  {
    track: "PERMANENT_RESIDENCE", label: "Permanent residence", goal: "Working toward permanent residence",
    requires: "Prøve i Dansk 2 (A2–B1) + Medborgerskabsprøven",
    examSlugs: ["prove-i-dansk-2", "medborgerskabsproven"],
  },
  {
    track: "GETTING_STARTED", label: "Getting started", goal: "Starting out in Danish",
    requires: "Prøve i Dansk 1 (A1–A2)",
    examSlugs: ["prove-i-dansk-1"],
  },
  {
    track: "UNIVERSITY", label: "University admission", goal: "Applying to a Danish-taught degree",
    requires: "Studieprøven (≈C1)",
    examSlugs: ["studieproven"],
  },
];

export function examBySlug(slug: string): ExamMeta | undefined {
  return ALL_EXAMS.find((e) => e.slug === slug);
}

export function examsByTrack(track: DanishTrack): ExamMeta[] {
  return ALL_EXAMS.filter((e) => e.track === track);
}

export function trackMeta(track: DanishTrack): TrackMeta | undefined {
  return TRACKS.find((t) => t.track === track);
}

const LANGUAGE_EXAM_IDS: LanguageExam[] = ["PD1", "PD2", "PD3", "STUDIEPROVEN"];
const KNOWLEDGE_EXAM_IDS: KnowledgeExam[] = ["INDFODSRETSPROVEN", "MEDBORGERSKABSPROVEN"];

export function isLanguageExam(exam: DanishExam): exam is LanguageExam {
  return (LANGUAGE_EXAM_IDS as string[]).includes(exam);
}

export function isKnowledgeExam(exam: DanishExam): exam is KnowledgeExam {
  return (KNOWLEDGE_EXAM_IDS as string[]).includes(exam);
}

/** The lead exam (Prøve i Dansk 3) — the citizenship hook. */
export function leadExam(): ExamMeta {
  return LANGUAGE_EXAMS.find((e) => e.lead) ?? LANGUAGE_EXAMS[2];
}
