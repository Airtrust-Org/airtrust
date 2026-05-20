-- production_patch_backfill_metadata.sql
-- Patch direto produção: replicar lógica da migration 0088 sem depender da cadeia.

UPDATE qualificacoes_historico
SET tipo_codigo = (
  SELECT qt.codigo FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (tipo_codigo IS NULL OR tipo_codigo = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET codigo = (
  SELECT qt.codigo FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (codigo IS NULL OR codigo = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

UPDATE qualificacoes_historico
SET categoria = (
  SELECT qt.categoria FROM qualificacoes_tipos qt
  WHERE qt.id = qualificacoes_historico.qualificacao_id AND qt.deleted_at IS NULL
)
WHERE (categoria IS NULL OR categoria = '')
  AND qualificacao_id IS NOT NULL
  AND deleted_at IS NULL;

-- Verificação resumida
-- SELECT COUNT(*) AS total_registros,
--        SUM(CASE WHEN tipo_codigo IS NULL OR tipo_codigo='' THEN 1 ELSE 0 END) AS faltando_tipo_codigo,
--        SUM(CASE WHEN categoria IS NULL OR categoria='' THEN 1 ELSE 0 END) AS faltando_categoria
-- FROM qualificacoes_historico WHERE deleted_at IS NULL;
