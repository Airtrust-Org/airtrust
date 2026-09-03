-- Compensatory rollback for 0482 training dependency complete-curriculum enrichment.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: PR follow-up to #225 / complete-training planning correction rollback
--   operational_decision: Disable future dependency snapshot enrichment while retaining non-destructive metadata already written.
--   dry_run_required: Confirm target schema and trigger presence before execution.
--   rollback_plan_required: scripts/rollback/0482_training_dependency_complete_curriculum.sql
--
DROP TRIGGER IF EXISTS trg_training_dependency_plan_enrich;
