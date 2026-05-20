-- Migration: Adicionar coluna entidade à tabela importacoes_log
-- Data: 2025-11-25
-- Descrição: Adiciona coluna entidade para identificar o tipo de importação

-- Adicionar coluna entidade
ALTER TABLE importacoes_log ADD COLUMN entidade TEXT NOT NULL DEFAULT 'funcionarios';

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_importacoes_log_entidade ON importacoes_log(entidade);
