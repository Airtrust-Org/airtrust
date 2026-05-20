-- Migration: Corrigir coluna is_instrutor em funcionarios
-- Data: 2025-11-06
-- Descrição: Marcar como instrutor todos os funcionários que possuem codigo_anac

-- 1. Atualizar is_instrutor para funcionários com código ANAC
UPDATE funcionarios 
SET is_instrutor = 1,
    updated_at = datetime('now')
WHERE codigo_anac IS NOT NULL 
  AND codigo_anac != ''
  AND deleted_at IS NULL
  AND is_instrutor = 0;

-- 2. Verificar resultado
SELECT 
  'RESULTADO' as tipo,
  COUNT(*) as total_funcionarios,
  SUM(CASE WHEN is_instrutor = 1 THEN 1 ELSE 0 END) as instrutores_marcados,
  SUM(CASE WHEN codigo_anac IS NOT NULL AND codigo_anac != '' THEN 1 ELSE 0 END) as com_codigo_anac
FROM funcionarios 
WHERE deleted_at IS NULL;
