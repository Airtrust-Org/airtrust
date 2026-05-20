-- 0184_add_modelo_aeronave_to_modelos_sessao.sql
-- Adiciona coluna `modelo_aeronave` em modelos_sessao (compat com front novo).

ALTER TABLE modelos_sessao ADD COLUMN modelo_aeronave TEXT;

-- Backfill: usa `codigo_aeronave` (legado) e cai para `tipo_aeronave`.
UPDATE modelos_sessao
SET modelo_aeronave = COALESCE(modelo_aeronave, codigo_aeronave, tipo_aeronave)
WHERE modelo_aeronave IS NULL;

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_modelo_aeronave ON modelos_sessao(modelo_aeronave);
