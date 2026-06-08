-- Migration 0393: adicionar empresa_id em licencas com backfill deterministico
-- Data: 2026-06-08
-- Escopo: tenant isolation do modulo de licencas

PRAGMA foreign_keys = ON;

ALTER TABLE licencas ADD COLUMN empresa_id INTEGER REFERENCES empresas(id);

UPDATE licencas
SET empresa_id = (
  SELECT f.empresa_id
  FROM funcionarios f
  WHERE f.id = licencas.funcionario_id
)
WHERE funcionario_id IS NOT NULL
  AND empresa_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_licencas_empresa_deleted
ON licencas(empresa_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_licencas_empresa_vencimento
ON licencas(empresa_id, data_vencimento);
