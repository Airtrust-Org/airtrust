-- change_id: ead-category-reconciliation-executor-0453
-- baseline_id: production-d1-baseline-v2-20260714
-- expected_sha: the exact current main SHA supplied to apply-schema-change-v2.yml.
-- rollback/neutralization: additive schema is retained; disable the reviewed
-- executor flag and preserve its immutable ledger/snapshot evidence. The
-- additive ledger is intentionally retained.
-- This file is intentionally DDL-only and semantically matches migration 0453.
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
