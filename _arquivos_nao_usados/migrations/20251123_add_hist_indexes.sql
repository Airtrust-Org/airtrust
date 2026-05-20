-- Migration: 20251123_add_hist_indexes.sql
-- Objetivo: Melhorar performance de consultas em /api/qualificacoes/historico
-- Índices focados em filtros e ordenação usados pela API (funcionario_id, qualificacao_id, categoria, data_vencimento)
-- Safe-guard IF NOT EXISTS para execuções idempotentes.

BEGIN TRANSACTION;

-- Índices simples
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_funcionario ON qualificacoes_historico(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_qualificacao ON qualificacoes_historico(qualificacao_id);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_categoria ON qualificacoes_historico(categoria);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_data_vencimento ON qualificacoes_historico(data_vencimento);

-- Índice composto para combinações frequentes (filtrar + ordenar)
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_func_qual_venc ON qualificacoes_historico(funcionario_id, qualificacao_id, data_vencimento);

-- Índice para consultas agregadas por vencimento (stats)
CREATE INDEX IF NOT EXISTS idx_qualificacoes_historico_vencimento_validade ON qualificacoes_historico(data_vencimento, deleted_at);

COMMIT;

-- Rollback manual (se necessário):
-- DROP INDEX idx_qualificacoes_historico_funcionario;
-- DROP INDEX idx_qualificacoes_historico_qualificacao;
-- DROP INDEX idx_qualificacoes_historico_categoria;
-- DROP INDEX idx_qualificacoes_historico_data_vencimento;
-- DROP INDEX idx_qualificacoes_historico_func_qual_venc;
-- DROP INDEX idx_qualificacoes_historico_vencimento_validade;
