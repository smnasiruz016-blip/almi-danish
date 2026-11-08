// RR-399 · A1 (attempts save), A4 (verified email before free AI) and, in AlmiNorwegian, A2 (the server decides the task type): each proof must turn RED when broken and GREEN when restored
// (each file restored byte-for-byte). Run: node scripts/sabotage-rr399.mjs   (needs the repo's deps for the tsx test)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DIR = existsSync("src/lib/billing/free-access.ts") ? "src/lib/billing" : "src/lib";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const test = () => spawnSync(`${npx} tsx scripts/verify-rr399.ts`, { encoding: "utf8", shell: true });
const schema = readFileSync("prisma/schema.prisma", "utf8");
const X = (/model (\w+)Attempt \{/.exec(schema) ?? [])[1];
const P = { Icelandic: "is", Danish: "dk", Norwegian: "no" }[X];
const CASES = [
  { name: `A1: the ${X}Attempt → ${X}Item foreign key comes back`, file: "prisma/schema.prisma", edits: [[`  // RR-399 A1: itemId is a plain id`, `  item    ${X}Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)\n  // RR-399 A1: itemId is a plain id`]], run: [test], fail: [`FAIL A1 schema`] },
  { name: "A1: the attempt write is silent again when it fails", file: `src/lib/${P}/grade-attempt.ts`, edits: [[`console.error("[${P}/submit] ATTEMPT NOT SAVED"`, `void ("[${P}/submit] ATTEMPT NOT SAVED"`]], run: [test], fail: ["FAIL A1 code: every"] },
  { name: "A4: the free door stops checking the email", file: `${DIR}/free-access.ts`, edits: [["if (user.emailVerified == null) {", "if (user.emailVerified === undefined) {"]], run: [test], fail: ["FAIL an unverified free user is refused"] },
];
/* A2 (AlmiNorwegian only): the server decides the task type of /api/no/grade */
const GT = "src/lib/no/grade-task.ts";
if (existsSync(GT)) {
  const a2 = () => spawnSync(`${npx} tsx scripts/verify-no-grade-task.mts`, { encoding: "utf8", shell: true });
  const noRefusal = [["if (body.taskType !== undefined && body.taskType !== item.taskType) {", "if (false) {"], ["if (body.skill !== undefined && body.skill !== item.skill) {", "if (false) {"]];
  CASES.push(
    { name: "A2: a body whose type disagrees with the item is no longer refused", file: GT, edits: noRefusal, run: [a2], fail: ["FAIL the route refuses (400) a body that says SPEAKING"] },
    { name: "A2: the body's taskType decides Writing or Speaking again", file: GT, edits: [...noRefusal, ['const isSpeaking = item.taskType === "SPEAKING_PROMPT";', 'const isSpeaking = (body.taskType ?? item.taskType) === "SPEAKING_PROMPT";']], run: [a2], fail: ["FAIL a Writing item is never graded as Speaking"] },
  );
}
const out = [];
for (const c of CASES) {
  const raw = readFileSync(c.file, "utf8");
  for (const [from] of c.edits) if (!raw.includes(from)) throw new Error(`anchor missing: ${c.name}`);
  try {
    writeFileSync(c.file, c.edits.reduce((s, [from, to]) => s.split(from).join(to), raw));
    const res = c.run.map((r) => r());
    out.push({ name: c.name, red: res.every((r, i) => r.status !== 0 && (r.stdout + r.stderr).includes(c.fail[i])) });
  } finally { writeFileSync(c.file, raw); }
  if (readFileSync(c.file, "utf8") !== raw) throw new Error(`${c.file} NOT restored`);
}
const g = test();
const g2 = existsSync(GT) ? spawnSync(`${npx} tsx scripts/verify-no-grade-task.mts`, { encoding: "utf8", shell: true }) : { status: 0 };
for (const o of out) console.log(`  [${o.red ? "RED as required" : "STAYED GREEN — BLIND"}] ${o.name}`);
console.log(`  restored: test ${g.status === 0 ? "GREEN" : "NOT GREEN"}${existsSync(GT) ? `, A2 test ${g2.status === 0 ? "GREEN" : "NOT GREEN"}` : ""}`);
const pass = out.every((o) => o.red) && g.status === 0 && g2.status === 0;
console.log(pass ? `\nSABOTAGE PASS — ${out.length}/${out.length} RED` : "\nSABOTAGE FAIL");
process.exitCode = pass ? 0 : 1;
