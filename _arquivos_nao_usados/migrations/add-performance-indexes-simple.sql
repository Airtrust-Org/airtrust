-- ========================================
-- ÍNDICES DE PERFORMANCE - D1 DATABASE (SIMPLIFICADO)
-- ========================================
-- Criado em: 10/11/2025
-- Apenas índices em colunas que existem
-- ========================================

-- Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email);

-- Habilitações
CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario ON habilitacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_validade ON habilitacoes(data_validade);

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo);

-- Certificações
CREATE INDEX IF NOT EXISTS idx_certificacoes_deleted ON certificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_funcionario ON certificacoes(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_certificacoes_validade ON certificacoes(data_validade);

-- Simulador Fichas
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_deleted ON simulador_fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_funcionario ON simulador_fichas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_data ON simulador_fichas(data_sessao);

-- Manobras
CREATE INDEX IF NOT EXISTS idx_manobras_deleted ON manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo);

-- ========================================
-- ÍNDICES BÁSICOS CRIADOS COM SUCESSO
-- ========================================
