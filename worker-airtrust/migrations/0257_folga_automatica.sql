-- Migration: Folga automática na quinzena oposta
-- Adiciona campo auto_gerado e tipo FOLGA

-- 1. Coluna auto_gerado em escala_alocacoes
ALTER TABLE escala_alocacoes ADD COLUMN auto_gerado INTEGER DEFAULT 0;

-- 2. Tipo de situação FOLGA
INSERT OR IGNORE INTO escala_situacao_tipos
  (codigo, nome, cor, icone, bloqueia_alocacao, ativo, ordem)
VALUES
  ('FOLGA', 'Folga', '#9ca3af', '🏖', 0, 1, 7);
