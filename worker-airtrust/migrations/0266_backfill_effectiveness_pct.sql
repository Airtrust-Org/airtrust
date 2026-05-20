-- Migration 0266: Backfill effectiveness_pct for existing frms_fatorizacao_jornada rows.
-- Formula matches calcEffectiveness() in calculos.ts:
--   effectiveness = max(0, min(100, 100 + total_fatorizado_jornada * 100))
-- Already executed directly via wrangler d1 execute on 2026-03-11.
-- This migration is idempotent (only updates rows where column is NULL).

UPDATE frms_fatorizacao_jornada
SET
  effectiveness_pct = MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))),
  effectiveness_nivel = CASE
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) >= 90 THEN 'verde'
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) <= 65 THEN 'vermelho'
    WHEN MAX(0.0, MIN(100.0, 100.0 + (total_fatorizado_jornada * 100.0))) <= 77 THEN 'amarelo'
    ELSE 'atencao'
  END,
  updated_at = CURRENT_TIMESTAMP
WHERE deleted_at IS NULL
  AND total_fatorizado_jornada IS NOT NULL
  AND effectiveness_pct IS NULL;
