-- ============================================
-- Migration: 0147_add_arquivado_fichas_sessao.sql
-- Adiciona campos para arquivamento na Pasta Virtual
-- ============================================

-- Adicionar coluna arquivado (boolean flag)
ALTER TABLE fichas_sessao ADD COLUMN arquivado INTEGER DEFAULT 0;

-- Adicionar coluna caminho_arquivo (path no R2)
ALTER TABLE fichas_sessao ADD COLUMN caminho_arquivo TEXT;

-- Adicionar coluna data_arquivamento
ALTER TABLE fichas_sessao ADD COLUMN data_arquivamento TEXT;

-- Index para buscar fichas arquivadas
CREATE INDEX IF NOT EXISTS idx_fichas_sessao_arquivado ON fichas_sessao(arquivado);
