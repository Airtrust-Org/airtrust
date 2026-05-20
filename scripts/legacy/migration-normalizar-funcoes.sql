-- Migration: Normalizar funções para padrão com primeira letra maiúscula
-- Data: 23/10/2025
-- Objetivo: Padronizar valores de função no banco de dados

-- Ver funções atuais
SELECT DISTINCT funcao, COUNT(*) as total
FROM funcionarios 
WHERE deleted_at IS NULL
GROUP BY funcao
ORDER BY funcao;

-- Atualizar funções para padrão
UPDATE funcionarios 
SET funcao = 'Piloto',
    updated_at = datetime('now')
WHERE funcao = 'PILOTO' 
  AND deleted_at IS NULL;

UPDATE funcionarios 
SET funcao = 'Copiloto',
    updated_at = datetime('now')
WHERE funcao = 'COPILOTO' 
  AND deleted_at IS NULL;

UPDATE funcionarios 
SET funcao = 'Instrutor de Voo',
    updated_at = datetime('now')
WHERE funcao = 'INSTRUTOR_VOO' 
  AND deleted_at IS NULL;

UPDATE funcionarios 
SET funcao = 'Mecânico',
    updated_at = datetime('now')
WHERE funcao = 'MECANICO' 
  AND deleted_at IS NULL;

UPDATE funcionarios 
SET funcao = 'Comissário',
    updated_at = datetime('now')
WHERE funcao = 'COMISSARIO' 
  AND deleted_at IS NULL;

-- Verificar resultado
SELECT DISTINCT funcao, COUNT(*) as total
FROM funcionarios 
WHERE deleted_at IS NULL
GROUP BY funcao
ORDER BY funcao;
