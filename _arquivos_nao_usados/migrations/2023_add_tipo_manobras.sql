-- ==========================================
-- Migration: Adicionar campos tipo_sessao e tipo_aeronave em manobras
-- Data: 2025-12-01
-- ==========================================

-- Adicionar colunas necessárias
ALTER TABLE manobras ADD COLUMN tipo_sessao TEXT DEFAULT 'TREINAMENTO';
ALTER TABLE manobras ADD COLUMN tipo_aeronave TEXT DEFAULT 'AW139';
ALTER TABLE manobras ADD COLUMN ordem INTEGER DEFAULT 1;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_sessao ON manobras(tipo_sessao);
CREATE INDEX IF NOT EXISTS idx_manobras_tipo_aeronave ON manobras(tipo_aeronave);
CREATE INDEX IF NOT EXISTS idx_manobras_ordem ON manobras(ordem);

SELECT 'Migration 2023 - Campos tipo_sessao e tipo_aeronave adicionados em manobras' as status;
