
-- Reverter índices criados
DROP INDEX IF EXISTS idx_historico_certificacoes_deleted_at;
DROP INDEX IF EXISTS idx_catalogo_treinamentos_deleted_at; 
DROP INDEX IF EXISTS idx_funcoes_deleted_at;
DROP INDEX IF EXISTS idx_funcionarios_deleted_at;
