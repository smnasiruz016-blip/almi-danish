// ITEM-ID COLLISION GATE.
//
// Grading is server-authoritative: /api/dk/submit and /api/dk/grade re-load an item by
// its stable id (hash of track|exam|skill|title) and mark against the SERVER-held key.
// If two bundle items hashed to the same id, getItemById() would return the wrong one
// and a learner's answer would be graded against a DIFFERENT item's key — with no error
// and a perfectly plausible score. This gate refuses the build in that case.
//
// It runs FIRST among the item gates, because every other guarantee in this repo's
// grading path is downstream of "the id resolves to the item you think it does".
//
// SEEN RED: duplicate a (track,exam,skill,title) tuple in any bundle → throws. Proven
// by injecting a duplicate title into a PD bundle before this was committed.
//
// Run: npm run gate:item-id

import { assertNoIdCollisions } from "../../src/lib/dk/items";

try {
  assertNoIdCollisions();
  console.log("✓ ITEM-ID GATE: every served item's stableItemId is unique.");
} catch (e) {
  console.error(`\n✗ ITEM-ID COLLISION GATE FAILED\n  ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
