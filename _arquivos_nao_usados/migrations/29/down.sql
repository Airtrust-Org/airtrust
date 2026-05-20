
-- Reverter auditoria de limpeza
DROP INDEX IF EXISTS idx_auditoria_limpeza_tabela;
DROP INDEX IF EXISTS idx_auditoria_limpeza_data_execucao;
DROP TABLE IF EXISTS auditoria_limpeza_dados;
