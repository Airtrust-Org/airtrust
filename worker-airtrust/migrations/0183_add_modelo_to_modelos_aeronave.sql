-- 0183_add_modelo_to_modelos_aeronave.sql
-- Adiciona coluna `modelo` (fonte única) sem remover campos antigos.

ALTER TABLE modelos_aeronave ADD COLUMN modelo TEXT;

-- Backfill: prioriza `codigo` (AW139, S76 etc) e cai para `nome`.
UPDATE modelos_aeronave
SET modelo = COALESCE(modelo, codigo, nome)
WHERE modelo IS NULL;

CREATE INDEX IF NOT EXISTS idx_modelos_aeronave_modelo ON modelos_aeronave(modelo);
