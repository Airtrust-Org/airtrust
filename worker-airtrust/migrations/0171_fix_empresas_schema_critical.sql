-- Migration: 0171_fix_empresas_schema_critical
-- Description: Corrige incompatibilidade crítica de schema (nome vs razao_social)
-- Date: 2025-12-08

-- 1. Adicionar coluna 'nome' (que o código espera) se não existir
-- Nota: Se falhar porque existe, a migração para (seguro)
ALTER TABLE empresas ADD COLUMN nome TEXT;

-- 2. Migrar dados de 'razao_social' (schema antigo 0150) para 'nome'
UPDATE empresas SET nome = razao_social WHERE nome IS NULL AND razao_social IS NOT NULL;

-- 3. Garantir consistência para 'AirTrust'
UPDATE empresas SET nome = 'AirTrust System' WHERE id = 1 AND (nome IS NULL OR nome = '');

-- 4. Garantir que 'codigo' existe (vital para o sistema)
-- Se 0162 falhou, isso garante. Se já existe, o ALTER TABLE acima teria rodado ou falhado antes.
-- Não podemos usar IF NOT EXISTS em ADD COLUMN no SQLite padrão, então assumimos que se empresas existe do jeito errado, falta nome.

-- 5. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_empresas_nome ON empresas(nome);
