-- ========================================
-- ÍNDICES CRÍTICOS - ULTRA SAFE
-- Data: 10/11/2025
-- Apenas agendamentos (tabela confirmada)
-- ========================================

CREATE INDEX IF NOT EXISTS idx_agend_func_id_v5 ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agend_sim_id_v5 ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agend_deleted_v5 ON agendamentos_simulador(deleted_at);
CREATE INDEX IF NOT EXISTS idx_agend_data_v5 ON agendamentos_simulador(data);
CREATE INDEX IF NOT EXISTS idx_agend_status_v5 ON agendamentos_simulador(status);
