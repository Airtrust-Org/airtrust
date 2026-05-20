-- ============================================
-- MIGRAÇÃO: Sistema de Vencimento Flexível
-- Data: 2025-10-23
-- Objetivo: Permitir vencimento no último dia do mês ou dia exato
-- ============================================

-- Adicionar campo vencimento_tipo em tipos_qualificacoes
ALTER TABLE tipos_qualificacoes ADD COLUMN vencimento_tipo TEXT DEFAULT 'DIA_EXATO' CHECK(vencimento_tipo IN ('DIA_EXATO', 'FIM_DO_MES'));

-- Atualizar tipos médicos para FIM_DO_MES
UPDATE tipos_qualificacoes 
SET vencimento_tipo = 'FIM_DO_MES', updated_at = datetime('now')
WHERE codigo IN ('CMA', 'ASO', 'EXAME_MEDICO', 'E2');

-- Garantir que todos os outros sejam DIA_EXATO
UPDATE tipos_qualificacoes 
SET vencimento_tipo = 'DIA_EXATO', updated_at = datetime('now')
WHERE vencimento_tipo IS NULL;

-- Verificação
SELECT 
  tipo,
  codigo,
  nome,
  validade_meses,
  vencimento_tipo
FROM tipos_qualificacoes
WHERE deleted_at IS NULL
ORDER BY tipo, codigo;
