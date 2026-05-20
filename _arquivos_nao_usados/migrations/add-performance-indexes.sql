-- ========================================
-- ÍNDICES DE PERFORMANCE - D1 DATABASE
-- ========================================
-- Criado em: 10/11/2025
-- Objetivo: Otimizar queries frequentes
-- ========================================

-- Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_email ON funcionarios(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_status ON funcionarios(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa ON funcionarios(empresa_id, deleted_at);

-- Habilitações
CREATE INDEX IF NOT EXISTS idx_habilitacoes_deleted ON habilitacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario ON habilitacoes(funcionario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_validade ON habilitacoes(data_validade, deleted_at);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_tipo ON habilitacoes(qualificacao_id, deleted_at);

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted ON qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo ON qualificacoes(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_tipo ON qualificacoes(tipo_qualificacao_id, deleted_at);

-- Certificações
CREATE INDEX IF NOT EXISTS idx_certificacoes_deleted ON certificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_funcionario ON certificacoes(funcionario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_validade ON certificacoes(data_validade, deleted_at);
CREATE INDEX IF NOT EXISTS idx_certificacoes_status ON certificacoes(status, deleted_at);

-- Simulador Fichas
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_deleted ON simulador_fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_funcionario ON simulador_fichas(funcionario_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_simulador ON simulador_fichas(simulador_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_status ON simulador_fichas(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_fichas_data ON simulador_fichas(data_sessao, deleted_at);

-- Simulador Sessões
CREATE INDEX IF NOT EXISTS idx_simulador_sessoes_deleted ON simulador_sessoes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulador_sessoes_ficha ON simulador_sessoes(ficha_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_simulador_sessoes_data ON simulador_sessoes(data_inicio, deleted_at);

-- Manobras
CREATE INDEX IF NOT EXISTS idx_manobras_deleted ON manobras(deleted_at);
CREATE INDEX IF NOT EXISTS idx_manobras_codigo ON manobras(codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_manobras_categoria ON manobras(categoria_id, deleted_at);

-- Empresas
CREATE INDEX IF NOT EXISTS idx_empresas_deleted ON empresas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_empresas_ativa ON empresas(ativa, deleted_at);

-- Aeronaves
CREATE INDEX IF NOT EXISTS idx_aeronaves_deleted ON aeronaves(deleted_at);
CREATE INDEX IF NOT EXISTS idx_aeronaves_empresa ON aeronaves(empresa_id, deleted_at);

-- Funções
CREATE INDEX IF NOT EXISTS idx_funcoes_deleted ON funcoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcoes_status ON funcoes(status, deleted_at);

-- Tipo Qualificações
CREATE INDEX IF NOT EXISTS idx_tipo_qualificacoes_deleted ON tipo_qualificacoes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tipo_qualificacoes_codigo ON tipo_qualificacoes(codigo) WHERE deleted_at IS NULL;

-- ========================================
-- VERIFICAÇÃO DOS ÍNDICES CRIADOS
-- ========================================
-- Para verificar, execute: 
-- SELECT * FROM sqlite_master WHERE type='index';
-- ========================================
