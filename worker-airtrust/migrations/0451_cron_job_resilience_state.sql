-- 0451_cron_job_resilience_state.sql
-- Estado durável para caps, checkpoints, leases, retomada e métricas de jobs internos.
-- Schema aditivo. Não altera triggers, rotas HTTP, dados LMS/EAD existentes ou workflows.

CREATE TABLE IF NOT EXISTS cron_job_state (
  job_name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  cursor_value TEXT,
  watermark_from TEXT,
  watermark_to TEXT,
  lease_owner TEXT,
  lease_expires_at TEXT,
  last_started_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error_code TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  processed_total INTEGER NOT NULL DEFAULT 0,
  failed_total INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (job_name, scope_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_cron_job_state_lease_expiry
  ON cron_job_state(lease_expires_at)
  WHERE lease_owner IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cron_job_state_last_success
  ON cron_job_state(job_name, last_success_at);

CREATE TABLE IF NOT EXISTS cron_job_items (
  job_name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'PENDING',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  available_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  PRIMARY KEY (job_name, scope_key, item_key)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_cron_job_items_pending
  ON cron_job_items(job_name, scope_key, status, available_at, item_key)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE IF NOT EXISTS cron_job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  lease_owner TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'RUNNING'
    CHECK (outcome IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED_LEASE')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cursor_before TEXT,
  cursor_after TEXT,
  error_code TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_lookup
  ON cron_job_runs(job_name, scope_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_outcome
  ON cron_job_runs(outcome, started_at DESC);
