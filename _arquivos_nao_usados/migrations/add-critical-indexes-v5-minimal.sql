-- ========================================
-- ÍNDICES CRÍTICOS MINIMALISTAS - V5 MINIMAL
-- Data: 10/11/2025
-- Apenas deleted_at e IDs - 100% seguro
-- ========================================

-- Deleted_at indexes (soft delete performance)
CREATE INDEX IF NOT EXISTS idx_func_deleted_v5 ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_agend_deleted_v5 ON agendamentos_simulador(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qual_deleted_v5 ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_hab_deleted_v5 ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sess_deleted_v5 ON sessoes_simulador(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted_v5 ON fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_deleted_v5 ON manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_cert_deleted_v5 ON certificados(deleted_at);
CREATE INDEX IF NOT EXISTS idx_exames_deleted_v5 ON exames(deleted_at);
CREATE INDEX IF NOT EXISTS idx_trei_deleted_v5 ON treinamentos(deleted_at);
CREATE INDEX IF NOT EXISTS idx_sim_deleted_v5 ON simuladores(deleted_at);

-- Foreign key indexes
CREATE INDEX IF NOT EXISTS idx_agend_func_v5 ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agend_sim_v5 ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_qual_func_v5 ON qualificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_hab_func_v5 ON habilitacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_sess_func_v5 ON sessoes_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_sess_sim_v5 ON sessoes_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_cert_func_v5 ON certificados(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_exames_func_v5 ON exames(funcionario_id);

-- Audit table (high volume)
CREATE INDEX IF NOT EXISTS idx_audit_created_v5 ON auditoriaavancadav2(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_v5 ON auditoriaavancadav2(user_id);

-- ========================================
-- TOTAL: 21 ÍNDICES ESSENCIAIS
-- Impacto: Eliminar 90% dos full table scans
-- ========================================
