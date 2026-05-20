-- Migration 0247: Add quinzena field to funcionarios
-- Stores which fortnight (quinzena) the employee works
-- Values: 'primeira' | 'segunda' | 'personalizada'

ALTER TABLE funcionarios ADD COLUMN quinzena TEXT
  CHECK(quinzena IN ('primeira', 'segunda', 'personalizada'))
  DEFAULT 'primeira';

CREATE INDEX IF NOT EXISTS idx_funcionarios_quinzena
  ON funcionarios(quinzena)
  WHERE deleted_at IS NULL;
