-- 0577: isolate a documented, non-runtime historical qualification backup.
-- PRECONDITION: independent, encrypted and restore-verified archive of the 525
-- original records exists OUTSIDE D1. See reviewed plan and issue #2155.
-- Execute only through production Schema V2 after immutable SHA approval.
--
-- Guard against accidental execution on a different production data shape.
CREATE TABLE "_archive_qh_guard_20261110" (
  row_count INTEGER NOT NULL CHECK (row_count = 525)
);
INSERT INTO "_archive_qh_guard_20261110" (row_count)
SELECT COUNT(*) FROM "_backup_qh_tmp";

-- Preserve every original column and row in a new non-operational table.
-- The source has an FK referencing absent funcionarios_backup; this
-- historical invalid relationship is intentionally NOT carried forward.
CREATE TABLE "_archive_qh_fk_20261110" AS
SELECT * FROM "_backup_qh_tmp";

-- The original source is a historical scratch table, not used by runtime.
-- Independent archive and D1 recovery point MUST precede this destructive DDL.
DROP TABLE "_backup_qh_tmp";
DROP TABLE "_archive_qh_guard_20261110";
