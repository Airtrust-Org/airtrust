
-- Remover tabela certificações v3
DROP INDEX IF EXISTS idx_certificacoes_v3_id_search;
DROP INDEX IF EXISTS idx_certificacoes_v3_compliance;
DROP INDEX IF EXISTS idx_certificacoes_v3_data_vencimento;
DROP INDEX IF EXISTS idx_certificacoes_v3_treinamento;
DROP INDEX IF EXISTS idx_certificacoes_v3_funcionario;
DROP TABLE IF EXISTS certificacoes_v3;
