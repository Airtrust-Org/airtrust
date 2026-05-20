-- ============================================================
-- MIGRATION 0057: Popular qualificacao_id usando código
-- Data: 2025-11-21
-- Objetivo: Garantir máximo de registros integrados (is_integrated=1 na view)
-- ============================================================

-- Popular qualificacao_id onde estiver NULL mas houver código correspondente em qualificacoes_tipos
UPDATE qualificacoes_historico
SET qualificacao_id = (
  SELECT qt.id FROM qualificacoes_tipos qt
  WHERE qt.codigo = qualificacoes_historico.codigo
    AND qt.deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_id IS NULL
  AND codigo IS NOT NULL
  AND deleted_at IS NULL;

-- Relatório pós-população
SELECT 
  COUNT(*) AS total,
  COUNT(qualificacao_id) AS com_fk,
  COUNT(*) - COUNT(qualificacao_id) AS sem_fk
FROM qualificacoes_historico
WHERE deleted_at IS NULL;
