-- Rollback Migration 1016: Versionamento de Arquivos R2

DROP INDEX IF EXISTS idx_arquivo_versoes_version;
DROP INDEX IF EXISTS idx_arquivo_versoes_qualificacao;
DROP TABLE IF EXISTS arquivo_versoes;
