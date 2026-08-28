-- 0474 — FRMS recovery activity / evidence V1
--
-- Additive persistence for classifying no-flight days and storing recovery
-- evidence. This migration does NOT change the canonical effectiveness score.
-- Numerical recovery modifiers remain disabled until longitudinal calibration
-- against crew-reported sleep/KSS and objective readiness/PVT evidence.

CREATE TABLE IF NOT EXISTS frms_recovery_activity_day (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  reference_date TEXT NOT NULL,
  no_flight_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (no_flight_confirmed IN (0,1)),
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'OFF_DUTY','STANDBY_HOME_HOTEL','STANDBY_ONSITE','ADMIN_TRAINING',
    'DUTY_TRAVEL','MIXED','OTHER','FLIGHT_NOT_IN_SOURCE','UNKNOWN'
  )),
  standby_location TEXT CHECK (standby_location IS NULL OR standby_location IN (
    'HOME','HOTEL','BASE_AIRPORT','OTHER'
  )),
  immediate_callout_required INTEGER CHECK (
    immediate_callout_required IS NULL OR immediate_callout_required IN (0,1)
  ),
  duty_start_time TEXT,
  duty_end_time TEXT,
  total_duty_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'CREW_REPORTED' CHECK (source IN (
    'CREW_REPORTED','ROSTER_CONFIRMED','SYSTEM_UNKNOWN'
  )),
  confidence TEXT NOT NULL DEFAULT 'REPORTED' CHECK (confidence IN (
    'REPORTED','CONFIRMED','UNKNOWN'
  )),
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_activity_person_day
  ON frms_recovery_activity_day (empresa_id, funcionario_id, reference_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_recovery_activity_type
  ON frms_recovery_activity_day (empresa_id, reference_date, activity_type)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS frms_recovery_activity_segment (
  id TEXT PRIMARY KEY,
  recovery_day_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'OFF_DUTY','STANDBY_HOME_HOTEL','STANDBY_ONSITE','ADMIN_TRAINING',
    'DUTY_TRAVEL','OTHER'
  )),
  start_time TEXT,
  end_time TEXT,
  duration_minutes INTEGER,
  location_kind TEXT CHECK (location_kind IS NULL OR location_kind IN (
    'HOME','HOTEL','BASE_AIRPORT','TRAVEL','OTHER'
  )),
  immediate_callout_required INTEGER CHECK (
    immediate_callout_required IS NULL OR immediate_callout_required IN (0,1)
  ),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_segment_sequence
  ON frms_recovery_activity_segment (empresa_id, recovery_day_id, sequence);

CREATE TABLE IF NOT EXISTS frms_recovery_assessment (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  reference_date TEXT NOT NULL,
  recovery_day_id TEXT,
  checkin_id TEXT,
  readiness_assessment_id TEXT,
  model_version TEXT NOT NULL,
  recovery_state TEXT NOT NULL CHECK (recovery_state IN (
    'UNKNOWN','LIMITED','PARTIAL','STRONG','CONFIRMED'
  )),
  recovery_confidence TEXT NOT NULL CHECK (recovery_confidence IN (
    'LOW','MEDIUM','HIGH'
  )),
  qualifying_recovery_night INTEGER NOT NULL DEFAULT 0 CHECK (
    qualifying_recovery_night IN (0,1)
  ),
  consecutive_qualifying_nights INTEGER NOT NULL DEFAULT 0,
  sleep_hours_24h REAL,
  sleep_target_hours REAL,
  kss_score INTEGER,
  readiness_classification TEXT,
  effectiveness_delta_pct REAL,
  reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (effectiveness_delta_pct IS NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_assessment_person_day
  ON frms_recovery_assessment (empresa_id, funcionario_id, reference_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_frms_recovery_assessment_state
  ON frms_recovery_assessment (empresa_id, reference_date, recovery_state)
  WHERE deleted_at IS NULL;
