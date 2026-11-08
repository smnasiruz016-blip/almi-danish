-- RR-399 A1: attempts never saved. DanishAttempt.itemId was a required foreign key to DanishItem, a table nothing fills
-- (items are served from JSON bundles), so every attempt write failed. Drop that FK; itemId stays a plain, indexed text id.
-- No data changes: no row is deleted or rewritten. IF EXISTS on both: safe whatever state the database is in (see the RR-399
-- report: this repo's 0_init migration was copied from almi-icelandic and describes Icelandic* tables).
ALTER TABLE IF EXISTS "DanishAttempt" DROP CONSTRAINT IF EXISTS "DanishAttempt_itemId_fkey";
