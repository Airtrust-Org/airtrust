-- Production Schema V2 change for 0468 SIGVOOS shadow leg crew V1.
-- Additive-only association of crew identity to shadow physical legs.
--
-- source_reference:
--   worker-airtrust/migrations/0468_sigvoos_shadow_leg_crew_v1.sql
-- operational_decision:
--   Create only the reviewed tenant-scoped shadow crew table/indexes. This
--   does not write FRMS operational tables or activate SIGVOOS shadow data.
-- dry_run_required:
--   Official Schema V2 workflow validates hashes, baseline, current schema
--   contract and unapplied change before remote execution.
-- rollback_plan_required:
--   Capture D1 Time Travel recovery point before apply. Application rollback
--   leaves additive shadow schema inert; destructive cleanup is separate.

CREATE TABLE IF NOT EXISTS sigvoos_shadow_leg_crews (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  leg_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  crew_identity_key TEXT NOT NULL,
  staff_id_sigvoos TEXT,
  staff_inscription TEXT,
  crew_resolution_method TEXT NOT NULL CHECK (crew_resolution_method IN ('MANUAL','CANAC','MATRICULA','NOME_FUZZY','NAO_ENCONTRADO')),
  crew_funcionario_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sigvoos_shadow_leg_crews_active
  ON sigvoos_shadow_leg_crews(empresa_id, leg_id, crew_identity_key)
  WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_leg_crews_funcionario_date
  ON sigvoos_shadow_leg_crews(empresa_id, crew_funcionario_id, leg_id);
