-- ========================================
-- ÍNDICES DE PERFORMANCE BÁSICOS
-- Apenas deleted_at e foreign keys
-- ========================================

-- Tabela: funcionarios
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);

-- Tabela: habilitacoes
CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario ON habilitacoes(funcionario_id);

-- Tabela: qualificacoes
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);

-- Tabela: certificacoes (se existir)
CREATE INDEX IF NOT EXISTS idx_certificacoes_deleted_v2 ON certificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_funcionario_v2 ON certificacoes(funcionario_id);

-- Tabela: simulador_fichas
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_deleted_v2 ON simulador_fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_funcionario_v2 ON simulador_fichas(funcionario_id);

-- Tabela: manobras
CREATE INDEX IF NOT EXISTS idx_manobras_deleted_v2 ON manobras(deleted_at);
