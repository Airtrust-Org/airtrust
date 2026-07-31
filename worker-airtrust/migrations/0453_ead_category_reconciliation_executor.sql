-- Narrow, tenant-scoped ledger for the one-off EAD category reconciliation.
-- This is additive only; the executor never accepts SQL, table names, tenants,
-- or arbitrary record IDs from a client.
CREATE TABLE IF NOT EXISTS ead_category_reconciliation_runs (
  run_uuid TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL CHECK (empresa_id = 6),
  plan_sha256 TEXT NOT NULL,
  source_sha TEXT NOT NULL,
  worker_version TEXT NOT NULL,
  snapshot_key TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  rollback_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('APPLIED', 'ROLLED_BACK')),
  totals_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  rolled_back_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ead_category_reconciliation_single_active
  ON ead_category_reconciliation_runs(empresa_id) WHERE status = 'APPLIED';
