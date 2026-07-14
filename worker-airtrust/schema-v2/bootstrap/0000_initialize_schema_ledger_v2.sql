CREATE TABLE IF NOT EXISTS airtrust_schema_baselines_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  baseline_id TEXT NOT NULL UNIQUE,
  schema_hash TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  source_worker_sha TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  contract_path TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUPERSEDED', 'ROLLED_BACK'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_airtrust_schema_baselines_v2_active
  ON airtrust_schema_baselines_v2 (status, baseline_id);

CREATE TABLE IF NOT EXISTS airtrust_schema_changes_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  change_id TEXT NOT NULL UNIQUE,
  baseline_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  plan_hash TEXT NOT NULL,
  github_sha TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')),
  applied_by TEXT NOT NULL DEFAULT 'manual-controlled-run',
  FOREIGN KEY (baseline_id) REFERENCES airtrust_schema_baselines_v2(baseline_id)
);

CREATE INDEX IF NOT EXISTS idx_airtrust_schema_changes_v2_baseline
  ON airtrust_schema_changes_v2 (baseline_id, applied_at);

INSERT INTO airtrust_schema_baselines_v2 (
  baseline_id,
  schema_hash,
  source_commit,
  source_worker_sha,
  plan_hash,
  contract_path,
  status
)
SELECT
  'production-d1-baseline-v2-20260714',
  'f3a1a2fa2ef07c50660d4c8180bd2bd9dcb98e5423317f7c20ea6d4c9ba787d7',
  '6d4fe1e8d3ca3b761a23c3c78662a273d1b85f97',
  '6d4fe1e8d3ca3b761a23c3c78662a273d1b85f97',
  '1dfc77817c1569e0c72aa34db85af37a36e0f6e29468217db565f7566775fbe7',
  'docs/database/schema-contracts/production-d1-baseline-v2.json',
  'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1
  FROM airtrust_schema_baselines_v2
  WHERE baseline_id = 'production-d1-baseline-v2-20260714'
);
