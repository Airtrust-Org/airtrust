-- Migration: 0016_habilitacoes_renovacao.sql
-- Adicionar colunas de rastreamento de renovações

ALTER TABLE habilitacoes ADD COLUMN habilitacao_anterior_id INTEGER;
ALTER TABLE habilitacoes ADD COLUMN eh_renovada INTEGER DEFAULT 0;
ALTER TABLE habilitacoes ADD COLUMN renovada_em TEXT;

CREATE INDEX IF NOT EXISTS idx_habilitacoes_anterior ON habilitacoes(habilitacao_anterior_id);
CREATE INDEX IF NOT EXISTS idx_habilitacoes_renovada ON habilitacoes(eh_renovada);