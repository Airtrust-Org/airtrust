
-- Remover índices
DROP INDEX IF EXISTS idx_pasta_virtual_sync_historico;
DROP INDEX IF EXISTS idx_pasta_virtual_sync_vencimento;
DROP INDEX IF EXISTS idx_pasta_virtual_sync_status;
DROP INDEX IF EXISTS idx_pasta_virtual_sync_funcionario;

-- Remover tabela
DROP TABLE IF EXISTS pasta_virtual_sync_log;
