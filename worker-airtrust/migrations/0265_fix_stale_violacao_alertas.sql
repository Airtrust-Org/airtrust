-- Migration 0265: Correct stale VIOLACAO alerts created when ALERTA_VIOLACAO_PCT was 100.
-- These 2 records were created at exactly 100%, which is below the corrected limit of 101.
-- Downgrade to CRITICO which is the correct level for percentual_atingido between 95 and 101.

UPDATE frms_alerta
SET nivel = 'CRITICO',
    updated_at = datetime('now')
WHERE nivel = 'VIOLACAO'
  AND percentual_atingido < 101
  AND deleted_at IS NULL;
