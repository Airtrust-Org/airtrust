-- 0497_training_compliance_aircraft_scope.sql
-- Adds optional aircraft-model scoping to training compliance rules.
-- The organizational scope (company/sector/function/employee) remains unchanged.

ALTER TABLE treinamento_requisitos ADD COLUMN aeronave_modelo TEXT;

DROP INDEX IF EXISTS idx_treinamento_requisitos_unique_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_requisitos_unique_active
  ON treinamento_requisitos (
    empresa_id,
    qualificacao_tipo_id,
    escopo,
    COALESCE(setor_id, 0),
    COALESCE(funcao_id, 0),
    COALESCE(funcionario_id, 0),
    COALESCE(NULLIF(TRIM(aeronave_modelo), ''), '')
  )
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamento_requisitos_empresa_aeronave
  ON treinamento_requisitos (empresa_id, aeronave_modelo)
  WHERE ativo = 1 AND deleted_at IS NULL AND aeronave_modelo IS NOT NULL;
