-- FRMS Daily Fatigue v0.1
-- Estrutura incremental para check-in diário orientado a revisão operacional humana.

ALTER TABLE frms_fadiga_checkin ADD COLUMN horas_sono_48h REAL;
ALTER TABLE frms_fadiga_checkin ADD COLUMN wake_time TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN subjective_fatigue_level INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN sleepiness_level INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN fit_for_duty INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN computed_risk_level TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE frms_fadiga_checkin ADD COLUMN requires_operational_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frms_fadiga_checkin ADD COLUMN report_source TEXT NOT NULL DEFAULT 'CREW_REPORTED';
ALTER TABLE frms_fadiga_checkin ADD COLUMN submitted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_risk_level_data
  ON frms_fadiga_checkin (empresa_id, computed_risk_level, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_operational_review
  ON frms_fadiga_checkin (empresa_id, requires_operational_review, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_report_source
  ON frms_fadiga_checkin (empresa_id, report_source, data_checkin)
  WHERE deleted_at IS NULL;
