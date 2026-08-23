-- AirTrust - SIGVOOS Real Shadow/Parallel V1 (Fase 0)
-- Scope: additive-only shadow/audit tables for a non-operational, read-only
-- comparison path B against the real SIGVOOS API. NONE of these tables are
-- read by FRMS operational code (alerts/rolling/decision) and none feed
-- frms_jornada. FRMS_CANONICAL_OPERATIONAL_SOURCE stays SIGVOOS via the
-- existing production path A (syncSigvoosForFrms), untouched by this file.
-- Idempotent, no backfill, no destructive changes.

CREATE TABLE IF NOT EXISTS sigvoos_shadow_runs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  period_from TEXT NOT NULL,
  period_to TEXT NOT NULL,
  execution_mode TEXT NOT NULL DEFAULT 'SHADOW' CHECK (execution_mode IN ('SHADOW')),
  source TEXT NOT NULL DEFAULT 'SIGVOOS' CHECK (source IN ('SIGVOOS')),
  status TEXT NOT NULL CHECK (status IN ('PENDING','RUNNING','COMPLETE','PARTIAL','FAILED','SUPERSEDED')),
  cursor_json TEXT,
  attempted_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  unmapped_count INTEGER NOT NULL DEFAULT 0,
  source_config_version TEXT,
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_runs_empresa_period
  ON sigvoos_shadow_runs(empresa_id, period_from, period_to);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_runs_empresa_status
  ON sigvoos_shadow_runs(empresa_id, status);

CREATE TABLE IF NOT EXISTS sigvoos_shadow_legs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  flight_report_id TEXT,
  leg_number INTEGER,
  external_identity_quality TEXT NOT NULL CHECK (external_identity_quality IN ('STABLE','UNSTABLE_IDENTITY')),
  identity_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  raw_hash TEXT,
  normalized_json TEXT NOT NULL,
  source_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (source_state IN ('ACTIVE','SOURCE_CHANGED','CANCELLED','STALE','MISSING_FROM_SOURCE')),
  crew_resolution_method TEXT CHECK (crew_resolution_method IN ('MANUAL','CANAC','MATRICULA','NOME_FUZZY','NAO_ENCONTRADO')),
  crew_funcionario_id TEXT,
  timezone_status TEXT NOT NULL DEFAULT 'TIMEZONE_UNRESOLVED' CHECK (timezone_status IN ('RESOLVED','TIMEZONE_UNRESOLVED')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_legs_empresa_identity
  ON sigvoos_shadow_legs(empresa_id, identity_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sigvoos_shadow_legs_empresa_identity_active
  ON sigvoos_shadow_legs(empresa_id, identity_key)
  WHERE active = 1;

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_legs_empresa_run
  ON sigvoos_shadow_legs(empresa_id, run_id);

CREATE TABLE IF NOT EXISTS sigvoos_shadow_leg_history (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  leg_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  transition TEXT NOT NULL CHECK (transition IN ('CREATED','SOURCE_CHANGED','CANCELLED','STALE','MISSING_FROM_SOURCE')),
  field_differences_json TEXT,
  recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_leg_history_empresa_leg
  ON sigvoos_shadow_leg_history(empresa_id, leg_id, recorded_at);

CREATE TABLE IF NOT EXISTS sigvoos_shadow_comparisons (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  identity_key TEXT NOT NULL,
  funcionario_id TEXT,
  competencia_data TEXT,
  classification TEXT NOT NULL CHECK (classification IN (
    'MATCH','DIFF_NONCRITICAL','DIFF_CRITICAL','ONLY_DIRECT_PATH','ONLY_SHADOW_PATH',
    'UNMAPPED_CREW','UNSTABLE_IDENTITY','TIMEZONE_UNRESOLVED','MANUAL_CONFLICT','SOURCE_CHANGED'
  )),
  direct_fingerprint TEXT,
  shadow_fingerprint TEXT,
  field_differences_json TEXT,
  compared_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_comparisons_empresa_run
  ON sigvoos_shadow_comparisons(empresa_id, run_id);

CREATE INDEX IF NOT EXISTS idx_sigvoos_shadow_comparisons_empresa_classification
  ON sigvoos_shadow_comparisons(empresa_id, classification);
