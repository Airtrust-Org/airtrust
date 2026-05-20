-- Migration 2014: Validação schema empresas
PRAGMA foreign_keys = OFF;
CREATE INDEX IF NOT EXISTS idx_empresas_nome ON empresas(nome);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_deleted ON empresas(deleted_at);
PRAGMA foreign_keys = ON;
SELECT 'Migration 2014 ok - empresas indices' as status;
