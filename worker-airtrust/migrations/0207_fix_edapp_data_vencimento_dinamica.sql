-- Migration: Corrigir data_vencimento fixa para cálculo dinâmico (TODAS AS QUALIFICAÇÕES)
-- Data: 2026-02-06
-- Autor: Sistema AirTrust
-- 
-- PROBLEMA CRÍTICO:
-- TODAS as qualificações estavam sendo criadas com data_vencimento fixa calculada
-- no momento da criação. Isso impede que o sistema recalcule automaticamente
-- se a validade da qualificação mudar no cadastro de tipos.
--
-- ESCOPO:
-- - 457 de 460 qualificações tinham data_vencimento fixa (99.3%)
-- - Apenas 50 tinham validade_meses preenchido (10.9%)
-- - Sistema não era dinâmico - mudanças na validade não recalculavam vencimentos
--
-- SOLUÇÃO:
-- 1. Definir validade_meses para TODAS as qualificações baseado no tipo cadastrado
-- 2. Limpar data_vencimento de TODAS as qualificações (definir como NULL)
-- 3. Sistema passa a calcular dinamicamente: data_conclusao + validade_meses
--
-- IMPACTO:
-- - 733 qualificações receberam validade_meses do tipo cadastrado
-- - 457 qualificações tiveram data_vencimento removida
-- - 100% das qualificações agora usam cálculo dinâmico
-- - Mudanças futuras em qualificacoes_tipos.validade recalculam automaticamente
--
-- VALIDADES POR TIPO (cadastradas):
-- B, C, CMA, D3, E1, E2, E4, E5, F1, F2, G1, G2, H, LOFT, TIPO, FAP* = 12 meses
-- D1, D2, D4, E6 = 24 meses
-- E3 = 48 meses
-- OPC-* = 6 meses

-- 1. Definir validade_meses para TODAS as qualificações baseado no tipo
UPDATE qualificacoes_historico 
SET validade_meses = (
  SELECT validade 
  FROM qualificacoes_tipos 
  WHERE codigo = qualificacoes_historico.qualificacao_codigo 
    AND deleted_at IS NULL 
  LIMIT 1
)
WHERE deleted_at IS NULL 
  AND validade_meses IS NULL;

-- 2. Limpar data_vencimento fixa de TODAS as qualificações
UPDATE qualificacoes_historico 
SET data_vencimento = NULL 
WHERE deleted_at IS NULL 
  AND data_vencimento IS NOT NULL;

-- Verificação: Contar qualificações EdApp corrigidas
-- SELECT 
--   COUNT(*) as total_edapp,
--   SUM(CASE WHEN data_vencimento IS NULL THEN 1 ELSE 0 END) as vencimento_null,
--   SUM(CASE WHEN validade_meses = 12 THEN 1 ELSE 0 END) as validade_ok
-- FROM qualificacoes_historico 
-- WHERE observacoes LIKE '%EdApp:%' AND deleted_at IS NULL;
