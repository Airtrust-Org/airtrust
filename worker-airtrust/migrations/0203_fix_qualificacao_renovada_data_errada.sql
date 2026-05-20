-- Migration 0203: Deletar qualificação antiga 3213 que ficou com data errada
-- 
-- Problema: Evento 20 do EdApp (completedAt: 2026-01-23) foi processado:
--   - Marcou qualificação 3213 (data 2025-08-28) como renovada=1
--   - MAS não deletou a antiga
--   - Criou nova qualificação 3966 (data 2026-01-23) corretamente
--
-- Resultado: Ficaram 2 registros ativos (3213 antiga + 3966 nova)
-- Fix: Soft delete da qualificação antiga 3213
--
-- Esta migration corrige o ÚNICO registro afetado encontrado na auditoria

-- 1. Soft delete da qualificação antiga que foi substituída
UPDATE qualificacoes_historico 
SET 
  deleted_at = datetime('now'),
  updated_at = datetime('now')
WHERE id = 3213;

-- Verificação: mostrar apenas a qualificação válida (3966)
SELECT 
  id,
  funcionario_id,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  renovada,
  'ATIVA' as status
FROM qualificacoes_historico
WHERE funcionario_id = 41
  AND qualificacao_codigo = 'B'
  AND deleted_at IS NULL
ORDER BY data_conclusao DESC;
