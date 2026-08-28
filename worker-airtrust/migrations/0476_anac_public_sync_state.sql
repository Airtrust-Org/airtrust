-- 0476 — ANAC public-data synchronization state and minimized RAB fleet cache
--
-- Global reference-source metadata is separated from tenant-scoped aircraft projections.
-- No full RAB payload or owner/operator personal data is persisted in D1.

CREATE TABLE IF NOT EXISTS anac_public_sync_state (
  source_id TEXT PRIMARY KEY,
  active_snapshot_hash TEXT,
  active_snapshot_key TEXT,
  source_etag TEXT,
  source_last_modified TEXT,
  last_checked_at TEXT,
  last_changed_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_http_status INTEGER,
  last_error_code TEXT,
  last_record_count INTEGER,
  last_rejected_count INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS anac_public_sync_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('PROMOTED', 'NOT_MODIFIED', 'UNCHANGED', 'FAILED', 'SKIPPED')),
  http_status INTEGER,
  source_etag TEXT,
  source_last_modified TEXT,
  snapshot_hash TEXT,
  snapshot_key TEXT,
  content_length INTEGER,
  record_count INTEGER,
  rejected_count INTEGER,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_anac_public_sync_runs_source_time
  ON anac_public_sync_runs (source_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_anac_public_sync_runs_outcome
  ON anac_public_sync_runs (outcome, started_at DESC);

CREATE TABLE IF NOT EXISTS anac_rab_aircraft_cache (
  empresa_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  registration TEXT NOT NULL,
  match_status TEXT NOT NULL
    CHECK (match_status IN ('MATCHED', 'NOT_FOUND', 'INVALID_REGISTRATION')),
  snapshot_hash TEXT NOT NULL,
  serial_number TEXT,
  category TEXT,
  type_certificate TEXT,
  model TEXT,
  manufacturer TEXT,
  aircraft_class TEXT,
  maximum_takeoff_weight REAL,
  icao_type TEXT,
  minimum_crew INTEGER,
  maximum_passengers INTEGER,
  seats INTEGER,
  manufacture_year INTEGER,
  cav_valid_until TEXT,
  ca_valid_until TEXT,
  registration_cancelled_at TEXT,
  airworthiness_code TEXT,
  airworthiness_status TEXT,
  source_checked_at TEXT NOT NULL,
  source_changed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id, aeronave_id)
);

CREATE INDEX IF NOT EXISTS idx_anac_rab_cache_registration
  ON anac_rab_aircraft_cache (registration);

CREATE INDEX IF NOT EXISTS idx_anac_rab_cache_tenant_status
  ON anac_rab_aircraft_cache (empresa_id, match_status, airworthiness_status);

CREATE INDEX IF NOT EXISTS idx_anac_rab_cache_snapshot
  ON anac_rab_aircraft_cache (snapshot_hash);
