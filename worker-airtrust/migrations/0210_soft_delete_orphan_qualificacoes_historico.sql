-- 0210_soft_delete_orphan_qualificacoes_historico.sql
-- Objetivo: preservar histórico sem quebrar integridade lógica
-- Estratégia: soft delete de registros órfãos (funcionário ou tipo inexistente/inativo)

UPDATE qualificacoes_historico
SET deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM funcionarios f
    WHERE f.id = qualificacoes_historico.funcionario_id
      AND f.deleted_at IS NULL
  );

UPDATE qualificacoes_historico
SET deleted_at = datetime('now'),
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM qualificacoes_tipos qt
    WHERE qt.id = qualificacoes_historico.qualificacao_id
      AND qt.deleted_at IS NULL
  );
