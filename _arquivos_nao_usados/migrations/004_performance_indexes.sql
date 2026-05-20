-- ============================================
-- MIGRATION 004: PERFORMANCE INDEXES
-- ============================================
-- Data: 11 de Novembro de 2025
-- Objetivo: Adicionar índices para otimizar queries
-- Status: Aligned with actual D1 schema

-- ============================================
-- FUNCIONÁRIOS - Busca por matrícula é comum
-- ============================================

CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula 
ON funcionarios(matricula) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_funcionarios_nome
ON funcionarios(nome)
WHERE deleted_at IS NULL;

-- ============================================
-- QUALIFICAÇÕES - Busca por código/categoria
-- ============================================

CREATE INDEX IF NOT EXISTS idx_qualificacoes_codigo 
ON qualificacoes(codigo) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_categoria 
ON qualificacoes(categoria) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_qualificacoes_ativo
ON qualificacoes(ativo, deleted_at);

-- ============================================
-- FICHAS - Busca por colaborador + simulador
-- ============================================

CREATE INDEX IF NOT EXISTS idx_fichas_colaborador 
ON fichas(colaborador_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_status 
ON fichas(status, simulador_id) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fichas_simulador
ON fichas(simulador_id)
WHERE deleted_at IS NULL;

-- ============================================
-- SESSÕES SIMULADOR - Busca por data e aluno
-- ============================================

CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_data 
ON sessoes_simulador(data_inicio, status) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_aluno 
ON sessoes_simulador(aluno_id, simulador_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessoes_simulador_simulador
ON sessoes_simulador(simulador_id)
WHERE deleted_at IS NULL;

-- ============================================
-- AUDITORIA - Busca por ação + timestamp
-- ============================================

CREATE INDEX IF NOT EXISTS idx_auditoria_acao 
ON auditoriaavancadav2(acao, timestamp);

CREATE INDEX IF NOT EXISTS idx_auditoria_user
ON auditoriaavancadav2(user_id, timestamp)
WHERE user_id IS NOT NULL;

-- ============================================
-- CATEGORIAS QUALIFICAÇÕES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_categorias_codigo
ON categorias_qualificacoes(codigo)
WHERE deleted_at IS NULL;

-- ============================================
-- RESULTADO: 12 indexes criados
-- ============================================
