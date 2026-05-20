-- ================================================================
-- Migration 0246: reforca unicidade de aeronave ativa por escala
-- ================================================================

UPDATE escala_tripulacoes
   SET deleted_at = COALESCE(deleted_at, datetime('now')),
       updated_at = datetime('now'),
       observacoes = TRIM(
         COALESCE(observacoes || '\n', '') || '[AUTO] Duplicidade removida por migration 0246'
       )
 WHERE id IN (
   WITH ranked AS (
     SELECT
       id,
       ROW_NUMBER() OVER (
         PARTITION BY escala_id,
           UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' ')))
         ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
       ) AS rn
     FROM escala_tripulacoes
     WHERE deleted_at IS NULL
   )
   SELECT id
   FROM ranked
   WHERE rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS ux_escala_tripulacoes_escala_aeronave_ativa
  ON escala_tripulacoes(
    escala_id,
    UPPER(TRIM(REPLACE(REPLACE(REPLACE(COALESCE(aeronave, ''), '  ', ' '), '  ', ' '), '  ', ' ')))
  )
  WHERE deleted_at IS NULL;