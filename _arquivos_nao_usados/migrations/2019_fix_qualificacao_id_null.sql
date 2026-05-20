-- Migration: Fix qualificacao_id NULL values in habilitacoes
-- Status: CRITICAL - Relationship broken between habilitacoes and qualificacoes
-- Date: 2025-11-03

-- Simple approach: Try to match by nome (most reliable)
UPDATE habilitacoes 
SET qualificacao_id = (
  SELECT id FROM qualificacoes 
  WHERE nome = habilitacoes.nome
  AND deleted_at IS NULL
  LIMIT 1
)
WHERE qualificacao_id IS NULL
  AND nome IS NOT NULL
  AND deleted_at IS NULL;
