-- MIGRATION 0045 - Performance Indexes para qualificacoes_historico
-- Objetivo: acelerar filtros por funcionario, qualificacao, status e ordenação por data_vencimento
-- Justificativa: rota /api/qualificacoes/historico usa WHERE sobre funcionario_id, qualificacao_id, status e ORDER BY data_vencimento DESC
-- Índices compostos reduzem varredura completa quando há alto volume

-- Índice composto por funcionario + status + data_vencimento
CREATE INDEX IF NOT EXISTS idx_qh_func_status_venc
  ON qualificacoes_historico(funcionario_id, status, data_vencimento)
  WHERE deleted_at IS NULL;

-- Índice composto por qualificacao + status + data_vencimento
CREATE INDEX IF NOT EXISTS idx_qh_qual_status_venc
  ON qualificacoes_historico(qualificacao_id, status, data_vencimento)
  WHERE deleted_at IS NULL;

-- Índice isolado de data_vencimento para ordenação e filtros por proximidade
CREATE INDEX IF NOT EXISTS idx_qh_data_vencimento
  ON qualificacoes_historico(data_vencimento)
  WHERE deleted_at IS NULL;

-- Verificação opcional: garantir colunas usadas existem
-- (SQLite/D1 ignora se já existem, mas deixamos comentário)
-- PRAGMA table_info(qualificacoes_historico);
