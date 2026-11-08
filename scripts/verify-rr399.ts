// RR-399 · A1 (attempts save) and A4 (verified email before the free AI scoring). Pure: source reads and pure calls of the free
// door with a fake count; no database, no AI, no secrets.
// Run: npx tsx scripts/verify-rr399.ts
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
let failed = 0;
const t = async (name: string, fn: () => unknown | Promise<unknown>) => {
  try { await fn(); console.log(`  PASS ${name}`); } catch (e) { failed++; console.log(`  FAIL ${name}\n       ${(e as Error).message.split("\n")[0]}`); }
};

const schema = read("prisma/schema.prisma");
const block = (model: string) => (new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`).exec(schema) ?? [])[1] ?? "";
const X = (/model (\w+)Attempt \{/.exec(schema) ?? [])[1] ?? "";
const strip = (s: string) => s.replace(/\/\/.*$/gm, "");
const walk = (d: string): string[] => !existsSync(d) ? [] : readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : /\.(tsx?|mts)$/.test(n) ? [f] : []; });
const src = walk(join(ROOT, "src")).map((f) => [relative(ROOT, f).split(sep).join("/"), readFileSync(f, "utf8")] as const);
const attemptDelegate = `${X.charAt(0).toLowerCase()}${X.slice(1)}Attempt`;

(async () => {
  console.log(`RR-399 A1 · ${X}Attempt`);
  await t(`A1 schema: ${X}Attempt has no @relation to ${X}Item (itemId is a plain, indexed id)`, () => {
    assert.ok(X, "no *Attempt model found in schema.prisma");
    const a = strip(block(`${X}Attempt`));
    assert.doesNotMatch(a, new RegExp(`\\b${X}Item\\b[^\\n]*@relation`), `${X}Attempt still has a relation to ${X}Item`);
    assert.match(a, /\bitemId\s+String\b/, "itemId is not a plain String");
    assert.match(a, /@@index\(\[itemId\]\)/, "itemId has no index");
    assert.doesNotMatch(strip(block(`${X}Item`)), new RegExp(`${X}Attempt\\[\\]`), `${X}Item still lists attempts`);
  });
  await t(`A1 migration: a migration drops "${X}Attempt_itemId_fkey"`, () => {
    const dir = join(ROOT, "prisma/migrations");
    const sql = readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()).map((d) => existsSync(join(dir, d, "migration.sql")) ? readFileSync(join(dir, d, "migration.sql"), "utf8") : "").join("\n");
    assert.match(sql, new RegExp(`ALTER TABLE (IF EXISTS )?"${X}Attempt" DROP CONSTRAINT (IF EXISTS )?"${X}Attempt_itemId_fkey"`));
  });
  await t(`A1 code: every ${attemptDelegate}.create is followed by a LOUD catch (console.error), never a silent one`, () => {
    const sites = src.filter(([, s]) => s.includes(`${attemptDelegate}.create(`));
    assert.ok(sites.length > 0, `no ${attemptDelegate}.create( found`);
    for (const [p, s] of sites) {
      let at = s.indexOf(`${attemptDelegate}.create(`);
      while (at >= 0) {
        const tail = s.slice(at, at + 1600);
        const c = /\}\s*catch\s*(\([^)]*\))?\s*\{([\s\S]*?)\n\s*\}/.exec(tail);
        if (c) assert.match(c[2], /console\.error\(/, `${p}: the attempt write is wrapped in a silent catch`);
        at = s.indexOf(`${attemptDelegate}.create(`, at + 1);
      }
    }
  });
  await t("A1 code: no comment says attempts cannot be saved, and nothing reads the dropped attempt.item relation", () => {
    for (const [p, s] of src) {
      assert.doesNotMatch(s, /attempts are optional this pass|already fails into its own catch|still fails into its own catch/i, `${p} still says attempts are not saved`);
      assert.doesNotMatch(s, /include:\s*\{[^}]*\bitem\s*:/, `${p} includes the item relation`);
    }
  });

  console.log("RR-399 A4 · verified email before the free AI scoring");
  const DIR = existsSync(join(ROOT, "src/lib/billing/free-access.ts")) ? "src/lib/billing" : "src/lib";
  const fa = await import(pathToFileURL(join(ROOT, `${DIR}/free-access.ts`)).href);
  const now = Date.now();
  const fresh = { id: "u-rr399", email: "learner@example.com", createdAt: new Date(now - 3_600_000), subscriptionStatus: null, stripeSubscriptionId: null, subscriptionCurrentPeriodEnd: null, compProUntil: null };
  await t("an unverified free user is refused (403) before anything is counted, reserved or sent to AI", async () => {
    let counted = 0;
    // the fake count answers 1 ("used") so that, even when this check is broken, the gate stops before the budget read: no database
    const r = await fa.aiGate({ ...fresh, emailVerified: null }, "WRITING", async () => { counted++; return 1; }, now);
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "Please verify your email before your free AI scoring.");
    assert.equal(counted, 0, "the gate counted (went on toward the AI) for an unverified account");
  });
  await t("a verified free user passes the email check (reaches the 1-per-kind count)", async () => {
    let counted = 0;
    const r = await fa.aiGate({ ...fresh, emailVerified: new Date(now - 60_000) }, "WRITING", async () => { counted++; return 1; }, now);
    assert.equal(counted, 1, "a verified account never reached the count");
    assert.equal(r.status, 402);
    assert.equal(r.body.reason, "USED");
  });
  await t("a paid (comped) account is unchanged: no email check, no count, nothing reserved", async () => {
    const r = await fa.aiGate({ ...fresh, emailVerified: null, compProUntil: new Date(now + 86_400_000) }, "SPEAKING", async () => { throw new Error("counted a paid user"); }, now);
    assert.equal(r.ok, true);
    assert.equal(r.free, false);
  });
  await t("practice without AI never needs the email check", () => {
    assert.equal(fa.hasPracticeAccess({ ...fresh, emailVerified: null }), true);
  });

  console.log(failed ? `\nRR-399 TEST FAIL (${failed})` : "\nRR-399 TEST PASS");
  process.exitCode = failed ? 1 : 0;
})();
