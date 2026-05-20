-- Migration: Consolidar aeronaves dos funcionários
-- Data: 2026-01-13
-- Objetivo: Migrar dados de funcionarios.aeronave (TEXT) para modelo_aeronave_id (FK)
-- Evitar duplicação de fontes de dados

-- 1. Atualizar funcionarios.modelo_aeronave_id baseado em funcionarios.aeronave
UPDATE funcionarios
SET modelo_aeronave_id = (
  SELECT ma.id 
  FROM modelos_aeronave ma
  WHERE UPPER(TRIM(ma.nome)) = UPPER(TRIM(funcionarios.aeronave))
     OR UPPER(TRIM(ma.codigo)) = UPPER(TRIM(funcionarios.aeronave))
  LIMIT 1
)
WHERE aeronave IS NOT NULL 
  AND aeronave != ''
  AND modelo_aeronave_id IS NULL
  AND deleted_at IS NULL;

-- 2. Log dos registros que não puderam ser migrados (para análise manual)
-- SELECT id, nome, matricula, aeronave, modelo_aeronave_id
-- FROM funcionarios
-- WHERE aeronave IS NOT NULL 
--   AND aeronave != ''
--   AND modelo_aeronave_id IS NULL
--   AND deleted_at IS NULL;

-- 3. Remover coluna aeronave após migração (comentado por segurança - executar após validação)
-- ALTER TABLE funcionarios DROP COLUMN aeronave;

-- Nota: A remoção da coluna aeronave será feita em migration futura após validação completa
