-- ================================================================
-- Migration 0245: integridade de tripulacoes + preferencias de usuario
-- ================================================================

UPDATE escala_tripulacoes
   SET deleted_at = COALESCE(deleted_at, datetime('now')),
       updated_at = datetime('now'),
       observacoes = TRIM(
         COALESCE(observacoes || '\n', '') || '[AUTO] Duplicidade removida por migration 0245'
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

CREATE TABLE IF NOT EXISTS usuario_preferencias (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  empresa_id INTEGER NOT NULL,
  chave TEXT NOT NULL,
  valor TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE(usuario_id, empresa_id, chave)
);

CREATE INDEX IF NOT EXISTS idx_usuario_preferencias_lookup
  ON usuario_preferencias(usuario_id, empresa_id, chave)
  WHERE deleted_at IS NULL;