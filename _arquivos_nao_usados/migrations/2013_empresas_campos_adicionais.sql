-- Migration 2013: Campos adicionais à tabela empresas
PRAGMA foreign_keys = OFF;
ALTER TABLE empresas ADD COLUMN logo_url TEXT;
ALTER TABLE empresas ADD COLUMN assinatura_diretor_url TEXT;
ALTER TABLE empresas ADD COLUMN assinatura_diretor_nome TEXT DEFAULT 'Diretor Geral';
PRAGMA foreign_keys = ON;
SELECT 'Migration 2013 ok' as status;
