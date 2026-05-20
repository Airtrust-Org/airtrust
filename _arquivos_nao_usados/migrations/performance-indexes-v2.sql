-- ==========================================
-- Performance Optimization - Indexes V2
-- Data: 2025-11-06
-- ==========================================

-- QUALIFICAÇÕES - buscas por deleted
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted_v2 
ON qualificacoes(deleted_at);

-- FUNCIONÁRIOS - buscas por instrutor
CREATE INDEX IF NOT EXISTS idx_funcionarios_instrutor_deleted_v2 
ON funcionarios(is_instrutor, deleted_at);

-- FICHAS - buscas por agendamento
CREATE INDEX IF NOT EXISTS idx_fichas_agendamento_deleted_v2 
ON fichas(agendamento_id, deleted_at);

-- HABILITAÇÕES - range queries
CREATE INDEX IF NOT EXISTS idx_habilitacoes_vencimento_v2 
ON habilitacoes(data_vencimento DESC);

-- AGENDAMENTOS - queries por status
CREATE INDEX IF NOT EXISTS idx_agendamentos_status_deleted_v2 
ON agendamentos_simulador(status, deleted_at);

-- SIMULADORES - buscas por status
CREATE INDEX IF NOT EXISTS idx_simuladores_status_deleted_v2 
ON simuladores(status, deleted_at);

-- MANOBRAS - listagens
CREATE INDEX IF NOT EXISTS idx_manobras_categoria_v2 
ON manobras(categoriaid, deleted_at);

-- SESSIONS/TEMPLATES - buscas por ativo
CREATE INDEX IF NOT EXISTS idx_sessoes_template_ativo_v2 
ON sessoes_template(ativo, deleted_at);

-- CATEGORIAS MANOBRAS
CREATE INDEX IF NOT EXISTS idx_categoriasmanobras_nome_v2 
ON categoriasmanobras(nome, deleted_at);

-- INDEXES PARA JOINS COMUNS
CREATE INDEX IF NOT EXISTS idx_habilitacoes_qualificacao_funcionario_v2 
ON habilitacoes(qualificacao_id, funcionario_id);

SELECT 'Performance indexes V2 criados com sucesso' as status;