-- ==========================================
-- Performance Optimization - Indexes
-- Data: 2025-11-06
-- ==========================================

-- HABILITAÇÕES - queries mais comuns
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario 
ON habilitacoes(funcionario_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_qualificacao 
ON habilitacoes(qualificacao_id, deleted_at);

-- QUALIFICAÇÕES - listagens
CREATE INDEX IF NOT EXISTS idx_qualificacoes_deleted 
ON qualificacoes(deleted_at);

-- MANOBRAS - listagens por categoria
CREATE INDEX IF NOT EXISTS idx_manobras_categoriaid 
ON manobras(categoriaid, deleted_at);

-- FUNCIONÁRIOS - buscas
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted 
ON funcionarios(deleted_at);

-- SESSOES TEMPLATE - listagens ativas
CREATE INDEX IF NOT EXISTS idx_sessoes_template_ativo 
ON sessoes_template(ativo, deleted_at);

-- CATEGORIAS MANOBRAS - ordenação
CREATE INDEX IF NOT EXISTS idx_categoriasmanobras_ordem 
ON categoriasmanobras(ordem, deleted_at);

SELECT 'Performance indexes criados com sucesso' as status;
