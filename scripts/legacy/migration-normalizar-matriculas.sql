-- Migration: Normalizar matrículas para 5 dígitos
-- Data: 23/10/2025
-- Objetivo: Garantir que todas as matrículas tenham 5 dígitos com zeros à esquerda

-- Ver matrículas que precisam ser normalizadas
SELECT 
  id,
  nome,
  matricula,
  LENGTH(matricula) as tamanho_atual,
  PRINTF('%05d', CAST(matricula AS INTEGER)) as matricula_normalizada
FROM funcionarios 
WHERE LENGTH(matricula) < 5 
  AND matricula GLOB '[0-9]*'
  AND deleted_at IS NULL;

-- Normalizar matrículas
UPDATE funcionarios 
SET matricula = PRINTF('%05d', CAST(matricula AS INTEGER)),
    updated_at = datetime('now')
WHERE LENGTH(matricula) < 5 
  AND matricula GLOB '[0-9]*'
  AND deleted_at IS NULL;

-- Verificar resultado
SELECT 
  COUNT(*) as total_normalizadas
FROM funcionarios 
WHERE LENGTH(matricula) = 5 
  AND deleted_at IS NULL;
