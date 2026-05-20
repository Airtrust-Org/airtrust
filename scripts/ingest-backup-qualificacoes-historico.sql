-- Ingest backup qualificacoes historico into main table if empty
-- Safe idempotent operation: only runs if main table has 0 non-deleted rows.
BEGIN TRANSACTION;
-- Ensure target table exists
-- (caller should have applied schema migrations already)

-- Check emptiness
-- Using a temp table to store count
CREATE TEMP TABLE IF NOT EXISTS _tmp_qh_count AS SELECT 0 AS c;
DELETE FROM _tmp_qh_count;
INSERT INTO _tmp_qh_count SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL;

-- Only proceed if empty
INSERT INTO qualificacoes_historico (
  funcionario_id,
  qualificacao_id,
  data_conclusao,
  data_vencimento,
  numero_certificado,
  observacoes,
  renovada,
  tipo_codigo,
  categoria,
  codigo,
  created_at,
  updated_at
)
SELECT 
  COALESCE(funcionario_id, 0) AS funcionario_id,
  COALESCE(NULL, 0) AS qualificacao_id,
  created_at AS data_conclusao,
  CASE WHEN validade GLOB '[0-9][0-9][0-9][0-9]-*' THEN validade ELSE NULL END AS data_vencimento,
  numero_certificado,
  observacoes,
  0 AS renovada,
  COALESCE(tipo_codigo, codigo) AS tipo_codigo,
  categoria,
  COALESCE(tipo_codigo, codigo) AS codigo,
  datetime('now'),
  datetime('now')
FROM _backup_qualificacoes_historico
WHERE (SELECT c FROM _tmp_qh_count) = 0
  AND (deleted_at IS NULL OR deleted_at IS NULL);

DROP TABLE IF EXISTS _tmp_qh_count;
COMMIT;
