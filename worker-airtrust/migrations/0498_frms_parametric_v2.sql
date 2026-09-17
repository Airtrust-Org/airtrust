-- ============================================================
-- 0498 FRMS Parametric V2
-- Approved 2026-09-17. Creates a new immutable HELICOPTER_OFFSHORE
-- policy revision; old revisions remain auditable and are superseded.
-- ============================================================

-- Some governed environments were selectively migrated and do not have 0474.
-- Bootstrap the additive recovery tables here so V2 does not depend on a skipped migration.
CREATE TABLE IF NOT EXISTS frms_recovery_activity_day (
  id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL,
  reference_date TEXT NOT NULL, no_flight_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (no_flight_confirmed IN (0,1)),
  activity_type TEXT NOT NULL CHECK (activity_type IN ('OFF_DUTY','STANDBY_HOME_HOTEL','STANDBY_ONSITE','ADMIN_TRAINING','DUTY_TRAVEL','MIXED','OTHER','FLIGHT_NOT_IN_SOURCE','UNKNOWN')),
  standby_location TEXT CHECK (standby_location IS NULL OR standby_location IN ('HOME','HOTEL','BASE_AIRPORT','OTHER')),
  immediate_callout_required INTEGER CHECK (immediate_callout_required IS NULL OR immediate_callout_required IN (0,1)),
  duty_start_time TEXT, duty_end_time TEXT, total_duty_minutes INTEGER,
  source TEXT NOT NULL DEFAULT 'CREW_REPORTED' CHECK (source IN ('CREW_REPORTED','ROSTER_CONFIRMED','SYSTEM_UNKNOWN')),
  confidence TEXT NOT NULL DEFAULT 'REPORTED' CHECK (confidence IN ('REPORTED','CONFIRMED','UNKNOWN')),
  notes TEXT, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_activity_person_day ON frms_recovery_activity_day (empresa_id, funcionario_id, reference_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_recovery_activity_type ON frms_recovery_activity_day (empresa_id, reference_date, activity_type) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS frms_recovery_activity_segment (
  id TEXT PRIMARY KEY, recovery_day_id TEXT NOT NULL, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL, sequence INTEGER NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('OFF_DUTY','STANDBY_HOME_HOTEL','STANDBY_ONSITE','ADMIN_TRAINING','DUTY_TRAVEL','OTHER')),
  start_time TEXT, end_time TEXT, duration_minutes INTEGER,
  location_kind TEXT CHECK (location_kind IS NULL OR location_kind IN ('HOME','HOTEL','BASE_AIRPORT','TRAVEL','OTHER')),
  immediate_callout_required INTEGER CHECK (immediate_callout_required IS NULL OR immediate_callout_required IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_segment_sequence ON frms_recovery_activity_segment (empresa_id, recovery_day_id, sequence);

CREATE TABLE IF NOT EXISTS frms_recovery_assessment (
  id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, funcionario_id INTEGER NOT NULL, reference_date TEXT NOT NULL,
  recovery_day_id TEXT, checkin_id TEXT, readiness_assessment_id TEXT, model_version TEXT NOT NULL,
  recovery_state TEXT NOT NULL CHECK (recovery_state IN ('UNKNOWN','LIMITED','PARTIAL','STRONG','CONFIRMED')),
  recovery_confidence TEXT NOT NULL CHECK (recovery_confidence IN ('LOW','MEDIUM','HIGH')),
  qualifying_recovery_night INTEGER NOT NULL DEFAULT 0 CHECK (qualifying_recovery_night IN (0,1)),
  consecutive_qualifying_nights INTEGER NOT NULL DEFAULT 0, sleep_hours_24h REAL, sleep_target_hours REAL,
  kss_score INTEGER, readiness_classification TEXT, effectiveness_delta_pct REAL, reasons_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT,
  CHECK (effectiveness_delta_pct IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_frms_recovery_assessment_person_day ON frms_recovery_assessment (empresa_id, funcionario_id, reference_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_frms_recovery_assessment_state ON frms_recovery_assessment (empresa_id, reference_date, recovery_state) WHERE deleted_at IS NULL;

ALTER TABLE frms_acumulo_rolling ADD COLUMN hv_ano_calendario_min INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frms_acumulo_rolling ADD COLUMN pct_limite_ano_calendario REAL NOT NULL DEFAULT 0;

ALTER TABLE frms_recovery_assessment ADD COLUMN absolute_rest_hours REAL;
ALTER TABLE frms_recovery_assessment ADD COLUMN no_work_hours REAL;
ALTER TABLE frms_recovery_assessment ADD COLUMN recovery_credit_points REAL NOT NULL DEFAULT 0;
ALTER TABLE frms_recovery_assessment ADD COLUMN recovery_credit_base_points REAL NOT NULL DEFAULT 0;
ALTER TABLE frms_recovery_assessment ADD COLUMN recovery_rest_factor REAL NOT NULL DEFAULT 0;
ALTER TABLE frms_recovery_assessment ADD COLUMN recovery_callout_multiplier REAL NOT NULL DEFAULT 1;
ALTER TABLE frms_recovery_assessment ADD COLUMN config_revision_id TEXT;
ALTER TABLE frms_recovery_assessment ADD COLUMN policy_version TEXT;

ALTER TABLE frms_fatorizacao_jornada ADD COLUMN operational_load_imc_delta REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN operational_load_imc_quality TEXT;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN operational_load_imc_json TEXT;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN recovery_credit_requested_points REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN recovery_credit_applied_points REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN hv_v2_raw_penalty_points REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN hv_v2_credit_applied_points REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN hv_v2_delta_points REAL;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN hv_v2_credit_generated_points REAL;

-- Create a new revision for every currently effective offshore revision.
INSERT INTO frms_config_revisions (
  id, empresa_id, profile_code, revision_number, status, source_type,
  source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
  actor_user_id, reason, supersedes_revision_id, created_at
)
SELECT
  r.id || '-v2-0498', r.empresa_id, r.profile_code,
  COALESCE((SELECT MAX(rr.revision_number) FROM frms_config_revisions rr
            WHERE rr.profile_code = r.profile_code
              AND COALESCE(rr.empresa_id, -1) = COALESCE(r.empresa_id, -1)), 0) + 1,
  'ACTIVE', 'APPROVED_OPERATIONAL_POLICY',
  'FRMS Parametric V2 approved coefficients — 2026-09-17', r.regulatory_profile_id,
  'FRMS_OPERATIONAL_POLICY_V2', '2026-09-17', NULL,
  NULL,
  'Approved parameterized FRMS V2: first-day recovery, HV D+1 credit, >8 landings, independent temperature, METAR IMC, night-only presentation, calendar/rolling profile selection.',
  r.id, datetime('now')
FROM frms_config_revisions r
WHERE r.status = 'ACTIVE'
  AND r.profile_code = 'HELICOPTER_OFFSHORE'
  AND r.effective_from <= '2026-09-17'
  AND (r.effective_to IS NULL OR r.effective_to >= '2026-09-17')
  AND r.policy_version <> 'FRMS_OPERATIONAL_POLICY_V2';

-- Copy the complete prior governed parameter set into the new revision.
INSERT INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, json_value, unit, metric,
  window_kind, direction, required, created_at
)
SELECT
  p.id || '-v2-0498', nr.id, p.parameter_key, p.numeric_value, p.json_value,
  p.unit, p.metric, p.window_kind, p.direction, p.required, datetime('now')
FROM frms_config_revisions nr
JOIN frms_config_parameters p ON p.revision_id = nr.supersedes_revision_id
WHERE nr.policy_version = 'FRMS_OPERATIONAL_POLICY_V2'
  AND nr.id LIKE '%-v2-0498';

-- Add V2-only coefficients. Values are the approved initial baseline, stored
-- in D1 revision data (not used as runtime code fallback).
INSERT INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, json_value, unit, metric,
  window_kind, direction, required, created_at
)
SELECT nr.id || '-' || x.parameter_key, nr.id, x.parameter_key, x.numeric_value,
       NULL, x.unit, 'FRMS_V2', x.window_kind, x.direction, 1, datetime('now')
FROM frms_config_revisions nr
CROSS JOIN (
  SELECT 'FRMS_V2_ENABLED' parameter_key, 1.0 numeric_value, 'boolean' unit, NULL window_kind, NULL direction
  UNION ALL SELECT 'LANDINGS_NEUTRAL_MAX', 8, 'landing', NULL, NULL
  UNION ALL SELECT 'LANDINGS_PENALTY_PER_EXCESS', 0.5, 'point/landing', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'LANDINGS_PENALTY_CAP_POINTS', 4, 'point', NULL, 'CAP'
  UNION ALL SELECT 'TEMP_BAND1_MIN_C', 30, 'celsius', NULL, NULL
  UNION ALL SELECT 'TEMP_BAND2_MIN_C', 32, 'celsius', NULL, NULL
  UNION ALL SELECT 'TEMP_BAND3_MIN_C', 34, 'celsius', NULL, NULL
  UNION ALL SELECT 'TEMP_BAND4_MIN_C', 36, 'celsius', NULL, NULL
  UNION ALL SELECT 'TEMP_BAND1_DELTA_POINTS', -0.5, 'point', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'TEMP_BAND2_DELTA_POINTS', -1, 'point', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'TEMP_BAND3_DELTA_POINTS', -1.5, 'point', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'TEMP_BAND4_DELTA_POINTS', -2, 'point', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'TEMP_PENALTY_CAP_POINTS', 2, 'point', NULL, 'CAP'
  UNION ALL SELECT 'IMC_VISIBILITY_THRESHOLD_M', 5000, 'meter', NULL, NULL
  UNION ALL SELECT 'IMC_CEILING_THRESHOLD_FT', 1500, 'foot', NULL, NULL
  UNION ALL SELECT 'IMC_DEPARTURE_DELTA_POINTS', -0.5, 'point/event', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'IMC_ARRIVAL_DELTA_POINTS', -0.75, 'point/event', NULL, 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'IMC_LEG_CAP_POINTS', 1, 'point', NULL, 'CAP'
  UNION ALL SELECT 'IMC_DAY_CAP_POINTS', 3, 'point', 'DAY', 'CAP'
  UNION ALL SELECT 'RECOVERY_HOTEL_MAX_POINTS', 4, 'point/day', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ONSITE_MAX_POINTS', 1.5, 'point/day', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_IMMEDIATE_CALLOUT_MULTIPLIER', 0.75, 'ratio', NULL, 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_NO_WORK_MIN_HOURS', 12, 'hour', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ABSOLUTE_REST_MIN_HOURS', 4, 'hour', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ABSOLUTE_REST_MID_HOURS', 6, 'hour', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ABSOLUTE_REST_FULL_HOURS', 8, 'hour', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ABSOLUTE_REST_LOW_FACTOR', 0.5, 'ratio', NULL, 'RECOVERY'
  UNION ALL SELECT 'RECOVERY_ABSOLUTE_REST_MID_FACTOR', 0.75, 'ratio', NULL, 'RECOVERY'
  UNION ALL SELECT 'HV_CREDIT_THRESHOLD_MINUTES', 120, 'minute', 'DAY', 'RECOVERY'
  UNION ALL SELECT 'HV_CREDIT_MAX_POINTS', 2, 'point', 'D+1', 'RECOVERY'
  UNION ALL SELECT 'HV_NEUTRAL_MAX_MINUTES', 420, 'minute', 'DAY', NULL
  UNION ALL SELECT 'HV_PENALTY_PER_EXCESS_HOUR_POINTS', 2, 'point/hour', 'DAY', 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'HV_PENALTY_CAP_POINTS', 4, 'point', 'DAY', 'CAP'
  UNION ALL SELECT 'PRESENTATION_NIGHT_START_HOUR', 22, 'hour', 'DAY', NULL
  UNION ALL SELECT 'PRESENTATION_NIGHT_END_HOUR', 2, 'hour', 'DAY', NULL
  UNION ALL SELECT 'PRESENTATION_NIGHT_DELTA_POINTS', -0.5, 'point', 'DAY', 'DECREASE_EFFECTIVENESS'
  UNION ALL SELECT 'ACCUMULATION_WINDOW_MODE', 0, 'enum:0_calendar,1_rolling,2_custom', NULL, NULL
  UNION ALL SELECT 'ACCUMULATION_USE_MONTH_CALENDAR', 1, 'boolean', 'MONTH_CALENDAR', NULL
  UNION ALL SELECT 'ACCUMULATION_USE_YEAR_CALENDAR', 1, 'boolean', 'YEAR_CALENDAR', NULL
  UNION ALL SELECT 'ACCUMULATION_USE_28D_ROLLING', 0, 'boolean', 'ROLLING_28D', NULL
  UNION ALL SELECT 'ACCUMULATION_USE_365D_ROLLING', 0, 'boolean', 'ROLLING_365D', NULL
) x
WHERE nr.policy_version = 'FRMS_OPERATIONAL_POLICY_V2'
  AND nr.id LIKE '%-v2-0498';

-- V2 neutralizes legacy coefficients that would double-count the new model.
UPDATE frms_config_parameters
SET numeric_value = 0
WHERE revision_id IN (
  SELECT id FROM frms_config_revisions WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
)
AND parameter_key IN (
  'APRESENTACAO_TARDE_FATOR',
  'HV_POUCAS_FATOR', 'HV_NORMAL_FATOR', 'HV_MUITAS_FATOR',
  'NOTURNO_FATOR',
  'FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY'
);

-- V2 WOCL is 02:00–06:00 and a flat -1.5 point contribution. The numerical
-- coefficient is internal policy; the window is independently governed.
UPDATE frms_config_parameters SET numeric_value = 120
WHERE parameter_key='WOCL_START_MINUTE' AND revision_id IN (
  SELECT id FROM frms_config_revisions WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
);
UPDATE frms_config_parameters SET numeric_value = 360
WHERE parameter_key='WOCL_END_MINUTE' AND revision_id IN (
  SELECT id FROM frms_config_revisions WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
);
UPDATE frms_config_parameters SET numeric_value = 0.015
WHERE parameter_key='WOCL_CENTER_PENALTY' AND revision_id IN (
  SELECT id FROM frms_config_revisions WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
);
UPDATE frms_config_parameters SET numeric_value = 0
WHERE parameter_key='WOCL_EDGE_PENALTY' AND revision_id IN (
  SELECT id FROM frms_config_revisions WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
);

-- Supersede prior revisions only after the V2 copy is complete.
UPDATE frms_config_revisions
SET status='SUPERSEDED', effective_to='2026-09-16'
WHERE id IN (
  SELECT supersedes_revision_id FROM frms_config_revisions
  WHERE policy_version='FRMS_OPERATIONAL_POLICY_V2' AND id LIKE '%-v2-0498'
);

CREATE INDEX idx_frms_recovery_credit_day
  ON frms_recovery_assessment (funcionario_id, reference_date, recovery_credit_points)
  WHERE deleted_at IS NULL;
