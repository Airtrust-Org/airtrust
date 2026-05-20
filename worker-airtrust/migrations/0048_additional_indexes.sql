-- 0048_additional_indexes.sql
-- Índices complementares para acelerar contagens e ordenações específicas

-- Filtro frequente por funcionario + status sem precisar de data vencimento
CREATE INDEX IF NOT EXISTS idx_qh_func_status ON qualificacoes_historico(funcionario_id, status);
-- Filtro frequente por qualificacao + status
CREATE INDEX IF NOT EXISTS idx_qh_qual_status ON qualificacoes_historico(qualificacao_id, status);
-- Ordenação por vencimento dentro do status (melhora queries focadas em vencimento)
CREATE INDEX IF NOT EXISTS idx_qh_status_vencimento ON qualificacoes_historico(status, data_vencimento);
