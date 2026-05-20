-- Migration 0118 Simplificada: Adicionar coluna modelo_aeronave_id
-- Mantém a coluna antiga 'aeronave' temporariamente para compatibilidade

-- 1. Adicionar nova coluna modelo_aeronave_id
ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id TEXT;

-- 2. Copiar dados de aeronave para modelo_aeronave_id
UPDATE funcionarios SET modelo_aeronave_id = aeronave WHERE aeronave IS NOT NULL;

-- 3. Criar índice na nova coluna
CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id);

-- Nota: A coluna 'aeronave' será removida em uma migration futura após validação
-- Por enquanto, ambas coexistem para garantir compatibilidade
