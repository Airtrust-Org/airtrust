-- ============================================================
-- MIGRATION 0055: Indexes para desempenho em qualificacoes_historico
-- Data: 2025-11-21
-- Objetivo: Melhorar performance em filtros frequentes (funcionario_id,
--           qualificacao_id, data_vencimento, status) e composições usadas
--           em ordenação/paginação.
-- ============================================================

-- Índice simples por funcionário (consultas de histórico por pessoa)
CREATE INDEX IF NOT EXISTS idx_qh_funcionario_id ON qualificacoes_historico(funcionario_id);

-- Índice simples por tipo de qualificação
CREATE INDEX IF NOT EXISTS idx_qh_qualificacao_id ON qualificacoes_historico(qualificacao_id);

-- Índice por data de vencimento (range scans e ordenações)
CREATE INDEX IF NOT EXISTS idx_qh_data_vencimento ON qualificacoes_historico(data_vencimento);

-- Índice por status (agregações rápidas)
CREATE INDEX IF NOT EXISTS idx_qh_status ON qualificacoes_historico(status);

-- Índice composto para consultas combinadas (funcionario + status + vencimento)
CREATE INDEX IF NOT EXISTS idx_qh_func_status_venc ON qualificacoes_historico(funcionario_id, status, data_vencimento);

-- Índice composto para listagens gerais por vencimento
CREATE INDEX IF NOT EXISTS idx_qh_status_venc ON qualificacoes_historico(status, data_vencimento);
