-- 0471 — FRMS operational readiness / brief vigilance persistence
--
-- Additive storage for the objective readiness assessment linked to the
-- existing daily fatigue check-in. No existing fatigue score/status is
-- overwritten by this migration.

CREATE TABLE IF NOT EXISTS frms_readiness_assessment (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  checkin_id TEXT,
  reference_date TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  scoring_version TEXT NOT NULL,
  classification TEXT NOT NULL
    CHECK (classification IN ('baseline_building', 'preserved', 'attention', 'operational_review')),
  baseline_sessions INTEGER NOT NULL DEFAULT 0,
  baseline_ready INTEGER NOT NULL DEFAULT 0 CHECK (baseline_ready IN (0, 1)),
  baseline_median_rt_ms REAL,
  baseline_lapse_rate REAL,
  median_rt_delta_pct REAL,
  lapse_rate_delta REAL,
  kss_score INTEGER,
  sleep_hours REAL,
  duration_ms INTEGER NOT NULL,
  valid_trials INTEGER NOT NULL DEFAULT 0,
  response_trials INTEGER NOT NULL DEFAULT 0,
  lapse_count INTEGER NOT NULL DEFAULT 0,
  lapse_rate REAL NOT NULL DEFAULT 0,
  false_start_count INTEGER NOT NULL DEFAULT 0,
  missed_count INTEGER NOT NULL DEFAULT 0,
  median_rt_ms REAL,
  mean_rt_ms REAL,
  p90_rt_ms REAL,
  sd_rt_ms REAL,
  response_speed REAL,
  warning_signals_json TEXT,
  critical_signals_json TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_readiness_checkin
  ON frms_readiness_assessment (empresa_id, checkin_id)
  WHERE checkin_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_readiness_person_day
  ON frms_readiness_assessment (empresa_id, funcionario_id, reference_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_readiness_baseline
  ON frms_readiness_assessment (empresa_id, funcionario_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_readiness_classification
  ON frms_readiness_assessment (empresa_id, reference_date, classification)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS frms_readiness_vigilance_trial (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  scheduled_at_ms INTEGER NOT NULL,
  stimulus_at_ms INTEGER NOT NULL,
  response_at_ms INTEGER,
  reaction_time_ms INTEGER,
  outcome TEXT NOT NULL
    CHECK (outcome IN ('response', 'lapse', 'false_start', 'missed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_readiness_trial_sequence
  ON frms_readiness_vigilance_trial (empresa_id, assessment_id, sequence);

CREATE INDEX IF NOT EXISTS idx_frms_readiness_trial_person
  ON frms_readiness_vigilance_trial (empresa_id, funcionario_id, assessment_id);
