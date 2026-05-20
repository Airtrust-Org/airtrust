-- Migration 0156: Adicionar tipo_aeronave em modelos_sessao
-- Permite filtrar modelos por tipo de sessão + tipo de aeronave

ALTER TABLE modelos_sessao ADD COLUMN tipo_aeronave TEXT;

-- Criar índice composto para performance
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_tipo_sessao_aeronave 
ON modelos_sessao(tipo_sessao_id, tipo_aeronave) 
WHERE deleted_at IS NULL;
