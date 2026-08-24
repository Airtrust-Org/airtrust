-- Production Schema V2 change for 0469 LMS Completion Diagnostics snapshots.
-- Additive-only persistence for informational AIRTRUST_COMPLETION_DIAGNOSTICS_V1.
--
-- source_reference:
--   worker-airtrust/migrations/0469_lms_completion_pendencias_snapshots.sql
-- operational_decision:
--   Create only the tenant-scoped diagnostics snapshot table/indexes. Stored
--   diagnostics never become authority for SCORM completion, score,
--   qualification, or certificate issuance.
-- dry_run_required:
--   Official Schema V2 workflow validates hashes, baseline, current schema
--   contract and unapplied change before remote execution.
-- rollback_plan_required:
--   Capture D1 Time Travel recovery point before apply. Application rollback
--   may leave the additive table inert; destructive cleanup is separate.

CREATE TABLE IF NOT EXISTS lms_completion_diagnostics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  tentativa INTEGER NOT NULL DEFAULT 1,
  diagnostics_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lms_completion_diag_unique
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id, curso_id, tentativa);

CREATE INDEX IF NOT EXISTS idx_lms_completion_diag_matricula
  ON lms_completion_diagnostics_snapshots (empresa_id, matricula_id);
