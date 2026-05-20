-- Migration 2015: Validação schema tipos_qualificacoes
PRAGMA foreign_keys = OFF;
CREATE INDEX IF NOT EXISTS idx_tipos_nome ON tipos_qualificacoes(nome);
CREATE INDEX IF NOT EXISTS idx_tipos_deleted ON tipos_qualificacoes(deleted_at);
PRAGMA foreign_keys = ON;
SELECT 'Migration 2015 ok - tipos indices' as status;
