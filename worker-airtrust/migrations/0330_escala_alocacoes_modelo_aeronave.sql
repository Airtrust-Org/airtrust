-- 0330_escala_alocacoes_modelo_aeronave.sql
-- Adiciona campo modelo_aeronave em escala_alocacoes para permitir alocação por
-- equipamento/modelo ao invés de aeronave específica (prefixo).
-- O campo aeronave_id permanece opcional — quando presente, modelo_aeronave é derivado.
-- Quando ausente, modelo_aeronave serve como agrupador na grade Gantt.

ALTER TABLE escala_alocacoes ADD COLUMN modelo_aeronave TEXT;

-- Backfill: preencher modelo_aeronave baseado na aeronave vinculada
UPDATE escala_alocacoes
SET modelo_aeronave = (
  SELECT a.modelo FROM aeronaves a WHERE a.id = escala_alocacoes.aeronave_id
)
WHERE aeronave_id IS NOT NULL
  AND modelo_aeronave IS NULL
  AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alocacoes_modelo_aeronave
  ON escala_alocacoes(modelo_aeronave)
  WHERE deleted_at IS NULL;
