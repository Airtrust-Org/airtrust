-- Restaurar registros renovados via ficha que foram marcados incorretamente como soft-deleted.
-- A restauração precisa ser conservadora para não violar a chave única
-- (funcionario_id, qualificacao_codigo, data_conclusao) quando já existir
-- um registro ativo com a mesma chave.
UPDATE qualificacoes_historico AS qh
SET deleted_at = NULL,
    status = 'RENOVADA',
    updated_at = datetime('now')
WHERE qh.id IN (
  SELECT MAX(a.id)
  FROM qualificacoes_historico a
  WHERE COALESCE(a.renovada, 0) = 1
    AND a.deleted_at IS NOT NULL
    AND a.observacoes LIKE '%Renovada via ficha #%'
  GROUP BY a.funcionario_id, a.qualificacao_codigo, COALESCE(a.data_conclusao, '')
)
AND NOT EXISTS (
  SELECT 1
  FROM qualificacoes_historico b
  WHERE b.funcionario_id = qh.funcionario_id
    AND b.qualificacao_codigo = qh.qualificacao_codigo
    AND COALESCE(b.data_conclusao, '') = COALESCE(qh.data_conclusao, '')
    AND b.id <> qh.id
    AND b.deleted_at IS NULL
);
