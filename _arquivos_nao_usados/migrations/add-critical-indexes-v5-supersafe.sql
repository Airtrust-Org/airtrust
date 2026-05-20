-- ========================================
-- ÍNDICES CRÍTICOS - SUPER SAFE
-- Data: 10/11/2025
-- Apenas tabelas confirmadas
-- ========================================

-- Agendamentos (confirmed structure)
CREATE INDEX IF NOT EXISTS idx_agend_func_id_v5 ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agend_sim_id_v5 ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agend_deleted_v5 ON agendamentos_simulador(deleted_at);
CREATE INDEX IF NOT EXISTS idx_agend_data_v5 ON agendamentos_simulador(data);
CREATE INDEX IF NOT EXISTS idx_agend_status_v5 ON agendamentos_simulador(status);

-- Funcionarios (primary table)
CREATE INDEX IF NOT EXISTS idx_func_deleted_v5 ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_func_status_v5 ON funcionarios(status);

-- Simuladores
CREATE INDEX IF NOT EXISTS idx_sim_deleted_v5 ON simuladores(deleted_at);

-- Audit (high volume)
CREATE INDEX IF NOT EXISTS idx_audit_created_v5 ON auditoriaavancadav2(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_v5 ON auditoriaavancadav2(user_id);

-- ========================================
-- TOTAL: 10 ÍNDICES SUPER CRÍTICOS
-- Impacto: Agendamentos + Funcionários
-- ========================================
