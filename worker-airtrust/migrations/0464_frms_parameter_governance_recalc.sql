-- ============================================================
-- 0464: FRMS parameter governance and auditable recalculation
--
-- Local schema only. This migration is not an authorization to apply D1.
-- ============================================================

CREATE TABLE frms_config_revisions (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  profile_code TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'RETIRED')),
  source_type TEXT NOT NULL,
  source_reference TEXT,
  regulatory_profile_id TEXT,
  policy_version TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  actor_user_id TEXT,
  reason TEXT NOT NULL,
  supersedes_revision_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (regulatory_profile_id) REFERENCES frms_regulatory_profiles(id),
  FOREIGN KEY (supersedes_revision_id) REFERENCES frms_config_revisions(id),
  UNIQUE (empresa_id, profile_code, revision_number)
);

CREATE INDEX idx_frms_config_revision_resolution
  ON frms_config_revisions (empresa_id, profile_code, status, effective_from, effective_to);

-- Explicit tenant-to-regulatory-profile assignment. Profile selection is never inferred.
CREATE TABLE frms_profile_assignments (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  regulatory_profile_id TEXT NOT NULL,
  profile_code TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'SUPERSEDED', 'RETIRED')),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  created_by INTEGER,
  approved_at TEXT,
  approved_by INTEGER,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (regulatory_profile_id) REFERENCES frms_regulatory_profiles(id),
  UNIQUE (empresa_id, regulatory_profile_id, effective_from)
);

CREATE INDEX idx_frms_profile_assignment_resolution
  ON frms_profile_assignments (empresa_id, status, effective_from, effective_to);

CREATE TABLE frms_config_parameters (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL,
  parameter_key TEXT NOT NULL,
  numeric_value REAL,
  json_value TEXT,
  unit TEXT NOT NULL,
  metric TEXT,
  window_kind TEXT,
  direction TEXT,
  required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (revision_id) REFERENCES frms_config_revisions(id),
  CHECK (numeric_value IS NOT NULL OR json_value IS NOT NULL),
  UNIQUE (revision_id, parameter_key)
);

CREATE INDEX idx_frms_config_parameter_revision
  ON frms_config_parameters (revision_id, parameter_key);

-- Explicit bootstrap of the existing model. These values retain their legacy
-- provenance and are not asserted to be ANAC/IOGP scientific limits.
INSERT INTO frms_config_revisions (
  id, empresa_id, profile_code, revision_number, status, source_type,
  source_reference, regulatory_profile_id, policy_version, effective_from, effective_to,
  actor_user_id, reason, supersedes_revision_id, created_at
) VALUES (
  'frms-legacy-global-v2', NULL, 'LEGACY_GENERAL', 1, 'ACTIVE', 'INTERNAL_POLICY',
  'Migration 0464 legacy bootstrap', NULL, 'LEGACY_MODEL_V2', '1970-01-01', NULL,
  NULL, 'Preserve pre-0464 numeric behavior under an immutable governed revision.', NULL, datetime('now')
);

INSERT INTO frms_config_parameters (
  id, revision_id, parameter_key, numeric_value, unit, metric, required, created_at
)
SELECT
  'frms-legacy-limit-' || nome, 'frms-legacy-global-v2', nome, valor_numerico,
  unidade, 'LEGACY_LIMIT', 1, datetime('now')
FROM frms_configuracao_limites
WHERE ativo = 1 AND deleted_at IS NULL;

-- Values formerly embedded in the biological/check-in and fortnight paths.
INSERT INTO frms_config_parameters (id, revision_id, parameter_key, numeric_value, unit, metric, required, created_at) VALUES
  ('frms-legacy-wocl-start', 'frms-legacy-global-v2', 'WOCL_START_MINUTE', 120, 'minute', 'BIOLOGICAL', 1, datetime('now')),
  ('frms-legacy-wocl-end', 'frms-legacy-global-v2', 'WOCL_END_MINUTE', 360, 'minute', 'BIOLOGICAL', 1, datetime('now')),
  ('frms-legacy-wocl-center', 'frms-legacy-global-v2', 'WOCL_CENTER_PENALTY', 0.30, 'fraction', 'BIOLOGICAL', 1, datetime('now')),
  ('frms-legacy-wocl-edge', 'frms-legacy-global-v2', 'WOCL_EDGE_PENALTY', 0.15, 'fraction', 'BIOLOGICAL', 1, datetime('now')),
  ('frms-legacy-meds', 'frms-legacy-global-v2', 'FATIGUE_MEDICATION_BONUS', 8, 'score', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-alcohol', 'frms-legacy-global-v2', 'FATIGUE_ALCOHOL_BONUS', 15, 'score', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-high', 'frms-legacy-global-v2', 'KSS_HIGH_THRESHOLD', 7, 'kss', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-fortnight-4d', 'frms-legacy-global-v2', 'FORTNIGHT_CONSECUTIVE_DAYS_ATTENTION', 4, 'day', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-fortnight-5d', 'frms-legacy-global-v2', 'FORTNIGHT_CONSECUTIVE_DAYS_CRITICAL', 5, 'day', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-fortnight-low-sleep', 'frms-legacy-global-v2', 'FORTNIGHT_LOW_SLEEP_HOURS', 6, 'hour', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-fortnight-low-effectiveness', 'frms-legacy-global-v2', 'FORTNIGHT_LOW_EFFECTIVENESS_PCT', 70, 'percent', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-kss-norm-2', 'frms-legacy-global-v2', 'KSS_NORM_LE_2', 0, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-norm-4', 'frms-legacy-global-v2', 'KSS_NORM_LE_4', 0.15, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-norm-6', 'frms-legacy-global-v2', 'KSS_NORM_LE_6', 0.4, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-norm-7', 'frms-legacy-global-v2', 'KSS_NORM_EQ_7', 0.7, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-norm-8', 'frms-legacy-global-v2', 'KSS_NORM_EQ_8', 0.85, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-kss-norm-9', 'frms-legacy-global-v2', 'KSS_NORM_GE_9', 1, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-missing', 'frms-legacy-global-v2', 'SLEEP_DURATION_MISSING_NORM', 0.6, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-8', 'frms-legacy-global-v2', 'SLEEP_DURATION_GE_8_NORM', 0, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-7', 'frms-legacy-global-v2', 'SLEEP_DURATION_GE_7_NORM', 0.15, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-6', 'frms-legacy-global-v2', 'SLEEP_DURATION_GE_6_NORM', 0.35, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-5', 'frms-legacy-global-v2', 'SLEEP_DURATION_GE_5_NORM', 0.6, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-4', 'frms-legacy-global-v2', 'SLEEP_DURATION_GE_4_NORM', 0.8, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-duration-lt4', 'frms-legacy-global-v2', 'SLEEP_DURATION_LT_4_NORM', 1, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-missing', 'frms-legacy-global-v2', 'SLEEP_QUALITY_MISSING_NORM', 0.4, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-5', 'frms-legacy-global-v2', 'SLEEP_QUALITY_GE_5_NORM', 0, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-4', 'frms-legacy-global-v2', 'SLEEP_QUALITY_EQ_4_NORM', 0.2, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-3', 'frms-legacy-global-v2', 'SLEEP_QUALITY_EQ_3_NORM', 0.45, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-2', 'frms-legacy-global-v2', 'SLEEP_QUALITY_EQ_2_NORM', 0.7, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-sleep-quality-lt2', 'frms-legacy-global-v2', 'SLEEP_QUALITY_LT_2_NORM', 1, 'fraction', 'CHECKIN', 1, datetime('now')),
  ('frms-legacy-ft-days-off', 'frms-legacy-global-v2', 'FORTNIGHT_DAYS_WITHOUT_DUTY', 2, 'day', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-long-rest', 'frms-legacy-global-v2', 'FORTNIGHT_LONG_REST_MINUTES', 780, 'minute', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-short-avg', 'frms-legacy-global-v2', 'FORTNIGHT_SHORT_AVG_DUTY_MINUTES', 360, 'minute', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-short-rest', 'frms-legacy-global-v2', 'FORTNIGHT_SHORT_REST_MINUTES', 600, 'minute', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-early-6', 'frms-legacy-global-v2', 'FORTNIGHT_EARLY_0600_MINUTES', 360, 'minute', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-early-7', 'frms-legacy-global-v2', 'FORTNIGHT_EARLY_0700_MINUTES', 420, 'minute', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-recur-early', 'frms-legacy-global-v2', 'FORTNIGHT_RECURRING_EARLY_PRESENTATIONS', 2, 'count', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-rolling-pct', 'frms-legacy-global-v2', 'FORTNIGHT_ROLLING_DUTY_PCT', 0.8, 'fraction', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-score-attn', 'frms-legacy-global-v2', 'FORTNIGHT_SCORE_ATTENTION', 45, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-score-critical', 'frms-legacy-global-v2', 'FORTNIGHT_SCORE_CRITICAL', 75, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-score-weight', 'frms-legacy-global-v2', 'FORTNIGHT_SCORE_LIMIT_WEIGHT', 0.65, 'fraction', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-trend-up', 'frms-legacy-global-v2', 'FORTNIGHT_TREND_INCREASING_IMPACT', 6, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-trend-down', 'frms-legacy-global-v2', 'FORTNIGHT_TREND_REDUCING_IMPACT', -4, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-positive', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_DAYS_WITHOUT_DUTY', -8, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-rest', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_LONG_REST', -6, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-avg', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_SHORT_AVG_DUTY', -5, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-noearly', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_NO_EARLY_PRESENTATION', -3, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-complete', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_COMPLETE_DATA', -4, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-consec4', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_CONSECUTIVE_ATTENTION', 8, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-consec5', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_CONSECUTIVE_CRITICAL', 14, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-checkin', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_CHECKIN_PENDING', 10, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-estimated', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_ESTIMATED_DATA', 7, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-early6', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_EARLY_0600', 8, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-early7', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_RECURRING_EARLY', 5, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-shortrest', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_SHORT_REST', 16, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-sleep', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_LOW_SLEEP', 12, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-kss', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_HIGH_KSS', 12, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-effective', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_LOW_EFFECTIVENESS', 14, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-rolling', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_ROLLING_DUTY', 10, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-critical', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_DAILY_CRITICAL', 18, 'score', 'PREVENTIVE', 1, datetime('now')),
  ('frms-legacy-ft-impacts-attention', 'frms-legacy-global-v2', 'FORTNIGHT_IMPACT_DAILY_ATTENTION', 7, 'score', 'PREVENTIVE', 1, datetime('now'));

CREATE TABLE frms_recalc_runs (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER,
  profile_code TEXT NOT NULL,
  previous_revision_id TEXT,
  target_revision_id TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  changed_parameter_keys_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'RUNNING', 'COMPLETE', 'FAILED', 'SUPERSEDED')),
  processed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cursor_json TEXT,
  error_summary TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (previous_revision_id) REFERENCES frms_config_revisions(id),
  FOREIGN KEY (target_revision_id) REFERENCES frms_config_revisions(id)
);

CREATE INDEX idx_frms_recalc_run_scope
  ON frms_recalc_runs (empresa_id, profile_code, status, effective_from, effective_to);

-- Derived rows must always disclose which immutable configuration produced them.
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN config_revision_id TEXT;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN model_version TEXT;
ALTER TABLE frms_fatorizacao_jornada ADD COLUMN recalc_state TEXT NOT NULL DEFAULT 'CURRENT'
  CHECK(recalc_state IN ('CURRENT', 'STALE', 'RECALC_PENDING', 'RECALCULATING', 'FAILED'));

CREATE INDEX idx_frms_fatorizacao_revision_state
  ON frms_fatorizacao_jornada (config_revision_id, recalc_state)
  WHERE deleted_at IS NULL;

-- Check-in is a scored result, not only raw input; retain the exact governed context.
ALTER TABLE frms_fadiga_checkin ADD COLUMN regulatory_profile_id TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN profile_code TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN config_revision_id TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN model_version TEXT;
CREATE INDEX idx_frms_checkin_governed_context
  ON frms_fadiga_checkin (empresa_id, config_revision_id, data_checkin)
  WHERE deleted_at IS NULL;
