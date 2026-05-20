-- ========================================
-- ÍNDICES CRÍTICOS - deleted_at APENAS
-- Data: 10/11/2025
-- Apenas deleted_at em todas as tabelas
-- ========================================

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
CREATE INDEX IF NOT EXISTS idx_aero_deleted_v5 ON aeronaves(deleted_at);
CREATE INDEX IF NOT EXISTS idx_user_deleted_v5 ON usuarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_func_aero_deleted_v5 ON funcionarios_aeronaves(deleted_at);

-- ========================================
-- TOTAL: 14 ÍNDICES
-- Impacto: WHERE deleted_at IS NULL
-- Elimina full table scans em soft deletes
-- ========================================
