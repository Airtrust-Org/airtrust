-- Alinha dados legados originalmente criados na empresa 1 para a empresa 6.
-- Regra confirmada em produção: todos os dados antigos, exceto os de teste da empresa 7,
-- pertencem à empresa 6 (Costa do Sol Táxi Aéreo).

BEGIN TRANSACTION;

UPDATE qualificacoes_historico
SET empresa_id = 6,
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND funcionario_id IN (
    SELECT id
    FROM funcionarios
    WHERE empresa_id = 6
      AND deleted_at IS NULL
  );

UPDATE documentos
SET empresa_id = 6,
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND funcionario_id IN (
    SELECT id
    FROM funcionarios
    WHERE empresa_id = 6
      AND deleted_at IS NULL
  );

UPDATE pasta_virtual
SET empresa_id = 6,
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND funcionario_id IN (
    SELECT id
    FROM funcionarios
    WHERE empresa_id = 6
      AND deleted_at IS NULL
  );

UPDATE qualificacoes_tipos
SET empresa_id = 6,
    updated_at = datetime('now')
WHERE empresa_id = 1
  AND deleted_at IS NULL
  AND id IN (
    SELECT DISTINCT qh.qualificacao_id
    FROM qualificacoes_historico qh
    INNER JOIN funcionarios f ON f.id = qh.funcionario_id
    WHERE qh.deleted_at IS NULL
      AND f.deleted_at IS NULL
      AND f.empresa_id = 6
  );

COMMIT;
