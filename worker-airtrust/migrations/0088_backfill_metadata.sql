-- 0088_backfill_metadata.sql
-- Backfill básico de metadata nas linhas históricas.
-- Objetivo: preencher colunas tipo_codigo, codigo e categoria quando ausentes
-- usando a tabela qualificacoes_tipos, mantendo integridade.
-- Idempotente: múltiplas execuções não alteram dados já preenchidos.

-- Preencher tipo_codigo quando vazio
UPDATE qualificacoes_historico
SET tipo_codigo = (
  SELECT qt.codigo FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (tipo_codigo IS NULL OR tipo_codigo = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

-- Preencher codigo se existir divergência (mantém tipo_codigo como principal)
UPDATE qualificacoes_historico
SET codigo = (
  SELECT qt.codigo FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (codigo IS NULL OR codigo = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

-- Preencher categoria
UPDATE qualificacoes_historico
SET categoria = (
  SELECT qt.categoria FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (categoria IS NULL OR categoria = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

-- Estatística pós-backfill (opcional para verificação manual)
-- SELECT COUNT(*) AS total, 
--        SUM(CASE WHEN tipo_codigo IS NULL OR tipo_codigo='' THEN 1 ELSE 0 END) AS sem_tipo_codigo,
--        SUM(CASE WHEN categoria IS NULL OR categoria='' THEN 1 ELSE 0 END) AS sem_categoria
-- FROM qualificacoes_historico WHERE deleted_at IS NULL;

-- FIM 0088