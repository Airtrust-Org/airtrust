-- Migration 0319: Adicionar índice em qualificacoes_historico.empresa_id
-- Auditoria técnica identificou que esta tabela crítica não possui índice em empresa_id,
-- causando full-table-scans em todas as queries multi-tenant.

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_empresa_id
  ON qualificacoes_historico (empresa_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_empresa_funcionario
  ON qualificacoes_historico (empresa_id, funcionario_id)
  WHERE deleted_at IS NULL;
