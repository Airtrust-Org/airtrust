-- ========================================
-- ÍNDICES DE PERFORMANCE - TABELAS EXISTENTES
-- ========================================

-- Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted_v3 ON funcionarios(deleted_at);

-- Habilitações
CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted_v3 ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario_v3 ON habilitacoes(funcionario_id);

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted_v3 ON qualificacoes(deleted_at);

-- Simulador Fichas
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_deleted_v3 ON simulador_fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_funcionario_v3 ON simulador_fichas(funcionario_id);

-- Manobras
CREATE INDEX IF NOT EXISTS idx_manobras_deleted_v3 ON manobras(deleted_at);
