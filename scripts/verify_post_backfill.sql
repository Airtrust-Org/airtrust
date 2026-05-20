-- verify_post_backfill.sql
-- Verificação pós-migration 0088 (backfill metadata)
-- Executar no D1 para confirmar integridade.

-- Totais base vs view
SELECT 'base_total' AS metrica, COUNT(*) AS valor FROM qualificacoes_historico WHERE deleted_at IS NULL
UNION ALL
SELECT 'view_total', COUNT(*) FROM qualificacoes_historico_v;

-- Campos ainda faltando (devem ser 0)
SELECT 
  SUM(CASE WHEN tipo_codigo IS NULL OR tipo_codigo='' THEN 1 ELSE 0 END) AS faltando_tipo_codigo,
  SUM(CASE WHEN codigo IS NULL OR codigo='' THEN 1 ELSE 0 END) AS faltando_codigo,
  SUM(CASE WHEN categoria IS NULL OR categoria='' THEN 1 ELSE 0 END) AS faltando_categoria
FROM qualificacoes_historico WHERE deleted_at IS NULL;

-- Distribuição por categoria (top 20)
SELECT categoria, COUNT(*) AS total
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY categoria
ORDER BY total DESC
LIMIT 20;

-- Status derivado (amostra) usando view
SELECT status_qualificacao, COUNT(*) AS total
FROM qualificacoes_historico_v
GROUP BY status_qualificacao
ORDER BY total DESC;

-- Inconsistências: registros sem correspondência em tipos
SELECT COUNT(*) AS orfaos_tipos
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM qualificacoes_tipos qt WHERE qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
  );

-- Inconsistências: registros sem funcionário
SELECT COUNT(*) AS orfaos_funcionarios
FROM qualificacoes_historico qh
WHERE qh.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM funcionarios f WHERE f.id = qh.funcionario_id AND f.deleted_at IS NULL
  );

-- FIM