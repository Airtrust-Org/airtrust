-- FRMS Daily Fatigue v0.1
-- Estrutura incremental para check-in diário orientado a revisão operacional humana.
--
-- Idempotência: usa ADD COLUMN IF NOT EXISTS (suportado no SQLite ≥ 3.37.0 e no
-- Cloudflare D1 a partir de 2022). Os índices já usam CREATE INDEX IF NOT EXISTS.
-- Esta migration pode ser reexecutada com segurança em ambientes com drift.

ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS horas_sono_48h REAL;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS wake_time TEXT;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS subjective_fatigue_level INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS sleepiness_level INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS fit_for_duty INTEGER;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS computed_risk_level TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS requires_operational_review INTEGER NOT NULL DEFAULT 0;
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS report_source TEXT NOT NULL DEFAULT 'CREW_REPORTED';
ALTER TABLE frms_fadiga_checkin ADD COLUMN IF NOT EXISTS submitted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_risk_level_data
  ON frms_fadiga_checkin (empresa_id, computed_risk_level, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_operational_review
  ON frms_fadiga_checkin (empresa_id, requires_operational_review, data_checkin)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fadiga_checkin_report_source
  ON frms_fadiga_checkin (empresa_id, report_source, data_checkin)
  WHERE deleted_at IS NULL;
