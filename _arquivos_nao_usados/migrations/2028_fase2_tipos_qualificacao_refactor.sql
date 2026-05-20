-- ============================================================
-- MIGRATION 2028: FASE 2 - Refatorar Tipos de Qualificação
-- Data: 2025-11-18
-- Objetivo: Alinhar com especificação Fase 2 (validade_valor + validade_unidade)
-- ============================================================

-- 1) Adicionar campos conforme Fase 2 (se não existirem)
ALTER TABLE qualificacoes_tipos ADD COLUMN validade_valor INTEGER;
ALTER TABLE qualificacoes_tipos ADD COLUMN validade_unidade TEXT; -- 'dias', 'meses', 'anos'

-- 2) Migrar dados existentes: validade_meses → validade_valor/unidade
UPDATE qualificacoes_tipos
SET 
  validade_valor = COALESCE(validade_meses, periodicidade_meses, 12),
  validade_unidade = 'meses'
WHERE validade_valor IS NULL;

-- 3) Garantir valores padrão para tipos sem validade definida
UPDATE qualificacoes_tipos
SET 
  validade_valor = 12,
  validade_unidade = 'meses'
WHERE validade_valor IS NULL OR validade_unidade IS NULL;

-- 4) Criar índices para performance (se não existirem)
CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_categoria 
  ON qualificacoes_tipos(categoria) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_codigo 
  ON qualificacoes_tipos(codigo) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tipos_qualificacao_nome_categoria 
  ON qualificacoes_tipos(nome, categoria) WHERE deleted_at IS NULL;

-- 5) Verificar integridade (output para log)
SELECT 
  'TIPOS_QUALIFICACAO_MIGRADOS' as status,
  COUNT(*) as total,
  SUM(CASE WHEN validade_valor IS NOT NULL THEN 1 ELSE 0 END) as com_validade,
  SUM(CASE WHEN deleted_at IS NULL THEN 1 ELSE 0 END) as ativos
FROM qualificacoes_tipos;
