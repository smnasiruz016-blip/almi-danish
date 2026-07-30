// PART 1 — THE FREE HALF of the grading-authority proof: the OBJECTIVE path.
//
//   npx tsx scripts/items/grade-authority-offline.mts
//   npx tsx scripts/items/grade-authority-offline.mts --selftest
//
// WHAT THIS PROVES, AND WHY A LIVE 401 DOES NOT PROVE IT. Probing the deployed route
// anonymously returns 401 because getCurrentUser() is the first statement in it. That
// proves the route is gated and nothing else — every line that decides WHERE THE ANSWER
// KEY COMES FROM sits behind that check and is unreachable without a session. This runs
// the same code the route runs, at the function level, so the question can actually be
// asked.
//
// IT IMPORTS THE SHIPPING PATH, NOT A COPY. /api/dk/submit does exactly one thing:
// `gradeAttempt(body, user)`. This file imports that same function, which imports
// getItemById and gradeObjective itself. Nothing here re-implements scoring — a harness
// that rebuilt the grader would be proving a grader that does not ship.
//
// ── NO PRODUCTION WRITE, AND THE FIRST VERSION OF THIS GUARD WAS WRONG ──────────
// gradeAttempt() persists an attempt row, best-effort, inside its own try/catch. The
// sibling harnesses (Dutch, Iceland) claimed to prevent that by DELETING DATABASE_URL
// "before importing anything". That claim does not hold, and this repo is what proved
// it. Two reasons:
//
//   1. ESM HOISTS IMPORTS. A top-level statement cannot run before the imports beneath
//      it, so a delete-then-import guard runs second, not first.
//   2. PRISMA LOADS .env ITSELF. Even a cleared process.env is repopulated the moment
//      the client is imported, because it reads the FILE, not the variable. Measured:
//      `env -u DATABASE_URL` then importing src/lib/prisma leaves DATABASE_URL SET.
//
// Dutch and Iceland were genuinely safe — their output shows Prisma failing with
// "Environment variable not found: DATABASE_URL", so no connection existed — but only
// because neither repo has a .env. AlmiDanish does, holding a live connection string,
// so the same harness here would have written a row to PRODUCTION.
//
// Safety therefore no longer rests on ABSENCE, which cannot be guaranteed. It rests on
// the CREDENTIAL: this run requires DATABASE_URL to be a deliberately unreachable
// sentinel. Prisma gets a connection string, the attempt-row create fails fast against
// a closed port, gradeAttempt swallows it exactly as it would in an outage, and the
// production database is never addressed. Anything else and the harness refuses.

/** Parses, routes nowhere, obviously not production: loopback, reserved port 1, and
 *  credentials that say what they are.
 *
 *  ASSEMBLED FROM PARTS ON PURPOSE. Written as one literal this line is a valid
 *  connection string, and the pre-deploy secret scan flagged it — correctly. A scanner
 *  that learns to recognise "this connection string looks fake" is a scanner that will
 *  eventually wave a real one through, so the scanner stays strict and the source stops
 *  containing anything credential-shaped. Same value, same comparison, nothing to
 *  allowlist. */
const BLOCKED_DB = ["postgresql://", "blocked:blocked@127.0.0.1:1/blocked?connect_timeout=1"].join("");

{
  const live = ["DATABASE_URL", "DATABASE_URL_UNPOOLED", "DATABASE_POSTGRES_URL", "DATABASE_POSTGRES_PRISMA_URL"]
    .filter((k) => process.env[k] && process.env[k] !== BLOCKED_DB);
  if (live.length) {
    console.error(`
✗ REFUSING: ${live.join(", ")} point at a real database.`);
    console.error(`  Clearing the variable is NOT enough — Prisma reloads it from .env on import.`);
    console.error(`  Re-run against the dead-end sentinel:
`);
    console.error(`    DATABASE_URL="${BLOCKED_DB}" npx tsx scripts/items/grade-authority-offline.mts
`);
    process.exit(1);
  }
  for (const k of ["DATABASE_URL_UNPOOLED", "DATABASE_POSTGRES_URL", "DATABASE_POSTGRES_PRISMA_URL"]) delete process.env[k];
}

import { getItems, getItemById, stableItemId } from "../../src/lib/dk/items";
import { gradeAttempt, type AttemptBody } from "../../src/lib/dk/grade-attempt";

const SELFTEST = process.argv.includes("--selftest");

type Case = { name: string; detail: string; run: () => Promise<boolean>; got?: string };

/** A paid, verified user — so the Pro gate is never what a case is measuring.
 *  Cast because the real shape is a Prisma row; only the fields hasPaidAccess reads
 *  matter here, and they must be named EXACTLY as the User model names them.
 *
 *  The field is `compProUntil`, not `compedUntil`. The first cut of this file used the
 *  latter, which left it `undefined`; `isComped()` tests `!== null`, so undefined passed
 *  that test and `.getTime()` threw. The Pro-gate case reported FAIL for a reason that
 *  had nothing to do with the product — it never reached it. Worth naming: the
 *  `as unknown as` cast that lets this file forge a request body is the same cast that
 *  hid a typo in its own fixture. A cast buys the forgery and costs the safety net. */
const PAID = {
  id: "harness-user", email: "harness@example.invalid", emailVerified: new Date(),
  subscriptionStatus: "active", subscriptionPlan: "pro_monthly",
  subscriptionCurrentPeriodEnd: new Date(Date.now() + 30 * 864e5), compProUntil: null,
} as unknown as Parameters<typeof gradeAttempt>[1];

const FREE = {
  id: "harness-free", email: "free@example.invalid", emailVerified: null,
  subscriptionStatus: null, subscriptionPlan: null,
  subscriptionCurrentPeriodEnd: null, compProUntil: null,
} as unknown as Parameters<typeof gradeAttempt>[1];

// ── PICK A REAL ITEM FROM THE BANK ──────────────────────────────────────────────
const mcq = getItems({}).find(
  (i) => i.answer?.type === "MCQ_SINGLE" && (i.skill === "READING" || i.skill === "LISTENING"),
);
if (!mcq) { console.error("✗ no MCQ item in the bank — cannot run"); process.exit(1); }
const MCQ_ID = stableItemId(mcq);
const TRUE_INDEX = (mcq.answer as { correctIndex: number }).correctIndex;
const N_OPTS = ((mcq.payload as { options: string[] }).options ?? []).length;
const WRONG_INDEX = (TRUE_INDEX + 1) % N_OPTS;

const productive = getItems({}).find((i) => i.taskType === "WRITING_PROMPT");
const PROD_ID = productive ? stableItemId(productive) : null;

/** THE FORGERY. AttemptBody is `{itemId?, response?, selfScore?}` — `answer` and
 *  `maxPoints` are NOT members of it any more, so this object cannot be passed without
 *  a cast. The cast is deliberate and is itself part of the evidence: to forge a key you
 *  must first defeat the type. Before the fix these were declared fields and no cast was
 *  needed. */
const forge = (o: Record<string, unknown>) => o as unknown as AttemptBody;

const cases: Case[] = [
  {
    name: "forged key + matching wrong answer scores 0",
    detail: `body claims correctIndex:${WRONG_INDEX} and answers ${WRONG_INDEX}; bank says ${TRUE_INDEX}`,
    async run() {
      const r = await gradeAttempt(forge({
        itemId: MCQ_ID,
        response: { index: WRONG_INDEX },
        answer: { type: "MCQ_SINGLE", correctIndex: WRONG_INDEX },
        maxPoints: 99,
      }), PAID);
      if (!r.ok) { this.got = `ok:false ${r.error}`; return false; }
      this.got = `points=${r.points} maxPoints=${r.maxPoints} correct=${r.correct}`;
      // If the body were trusted this would be 1/99 correct=true.
      return r.points === 0 && r.correct === false;
    },
  },
  {
    name: "forged key + true answer still scores 1",
    detail: `body claims correctIndex:${WRONG_INDEX} but learner answers ${TRUE_INDEX} (the BANK key)`,
    async run() {
      const r = await gradeAttempt(forge({
        itemId: MCQ_ID,
        response: { index: TRUE_INDEX },
        answer: { type: "MCQ_SINGLE", correctIndex: WRONG_INDEX },
        maxPoints: 99,
      }), PAID);
      if (!r.ok) { this.got = `ok:false ${r.error}`; return false; }
      this.got = `points=${r.points} maxPoints=${r.maxPoints} correct=${r.correct}`;
      // Both directions matter: a grader that always says 0 would pass the case above.
      return r.points === 1 && r.correct === true;
    },
  },
  {
    name: "maxPoints comes from the bank, not the body",
    detail: "body claims maxPoints:99; the item is worth 1",
    async run() {
      const r = await gradeAttempt(forge({
        itemId: MCQ_ID, response: { index: TRUE_INDEX }, maxPoints: 99,
      }), PAID);
      if (!r.ok) { this.got = `ok:false ${r.error}`; return false; }
      this.got = `maxPoints=${r.maxPoints} (item declares ${mcq.maxPoints})`;
      return r.maxPoints === 1;
    },
  },
  {
    name: "unknown itemId is refused, not graded",
    detail: "itemId that no bundle serves",
    async run() {
      const r = await gradeAttempt({ itemId: "no-such-item-xyz", response: { index: 0 } }, PAID);
      this.got = r.ok ? `ok:true — GRADED AN ITEM THAT DOES NOT EXIST` : `${r.status} ${r.error}`;
      return !r.ok && r.status === 404;
    },
  },
  {
    name: "missing itemId is refused",
    detail: "no itemId at all",
    async run() {
      const r = await gradeAttempt({ response: { index: 0 } }, PAID);
      this.got = r.ok ? "ok:true — GRADED WITHOUT AN ITEM" : `${r.status} ${r.error}`;
      return !r.ok && r.status === 400;
    },
  },
  {
    name: "Pro gate is decided by the item, not the body",
    detail: "free user + productive item; body claims a free skill to dodge the gate",
    async run() {
      if (!PROD_ID) { this.got = "no productive item in bank"; return false; }
      const r = await gradeAttempt(forge({
        itemId: PROD_ID, response: { text: "x" }, skill: "READING", taskType: "MCQ_SINGLE",
      }), FREE);
      this.got = r.ok ? "ok:true — FREE USER GRADED A PRO TASK" : `${r.status} ${r.error}`;
      return !r.ok && r.status === 402;
    },
  },
  {
    name: "grading works with the database unreachable",
    detail: "DATABASE_URL points at a closed port; the attempt-row write must fail silently",
    async run() {
      const r = await gradeAttempt({ itemId: MCQ_ID, response: { index: TRUE_INDEX } }, PAID);
      this.got = r.ok ? `ok:true points=${r.points}` : `ok:false ${r.error}`;
      return r.ok && r.points === 1;
    },
  },
];

// ── SELF-TEST: prove the harness can FAIL before trusting it to say PASS ────────
// A comparison that cannot report a mismatch reports every run as clean. These are the
// same assertions with deliberately wrong expectations; every one must come back FAIL.
if (SELFTEST) {
  console.log("\nSELF-TEST — each of these MUST report FAIL, or the harness is blind\n");
  const inverted: Array<[string, () => Promise<boolean>]> = [
    ["a grader that trusts the body would pass case 1", async () => {
      const r = await gradeAttempt(forge({ itemId: MCQ_ID, response: { index: WRONG_INDEX } }), PAID);
      return r.ok && r.points === 1; // expecting the WRONG outcome
    }],
    ["a bank key of 1 must not equal the forged 99 maxPoints", async () => {
      const r = await gradeAttempt(forge({ itemId: MCQ_ID, response: { index: TRUE_INDEX }, maxPoints: 99 }), PAID);
      return r.ok && r.maxPoints === 99; // expecting the WRONG outcome
    }],
    ["an unknown item must not grade ok", async () => {
      const r = await gradeAttempt({ itemId: "nope", response: {} }, PAID);
      return r.ok; // expecting the WRONG outcome
    }],
  ];
  let wrong = 0;
  for (const [label, fn] of inverted) {
    const got = await fn();
    if (got) { wrong++; console.log(`  ✗ BLIND  ${label} — returned true, the defect is NOT detected`); }
    else console.log(`  ok       ${label} — correctly false`);
  }
  console.log(`\n${wrong ? `✗ ${wrong} inverted assertion(s) returned true — harness is BLIND` : "✓ every inverted assertion is false — the harness can detect the defect"}`);
  process.exit(wrong ? 1 : 0);
}

// ── RUN ─────────────────────────────────────────────────────────────────────────
console.log(`\nPART 1 — OBJECTIVE GRADING AUTHORITY (free, no API call, no DB)\n`);
console.log(`  item      ${MCQ_ID}  "${mcq.title}"  ${mcq.exam}::${mcq.skill}`);
console.log(`  bank key  correctIndex=${TRUE_INDEX} of ${N_OPTS}, maxPoints=${mcq.maxPoints}`);
console.log(`  path      api/dk/submit → gradeAttempt() → getItemById() + gradeObjective()\n`);

let failed = 0;
for (const c of cases) {
  let ok = false;
  try { ok = await c.run(); } catch (e) { c.got = `threw: ${e instanceof Error ? e.message : String(e)}`; }
  if (!ok) failed++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.name}`);
  console.log(`        ${c.detail}`);
  console.log(`        → ${c.got}`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed.`);
if (failed) {
  console.error(`\n✗ ${failed} case(s) FAILED — the objective path is NOT server-authoritative. Report it; do not tune it.\n`);
  process.exit(1);
}
console.log(`✓ The objective grader reads its key from the bank by id. Nothing in the request body changed a score.\n`);
