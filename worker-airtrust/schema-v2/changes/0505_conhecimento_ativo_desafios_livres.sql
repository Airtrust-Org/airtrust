-- operational_decision: cada desafio de Conhecimento Ativo passa a ter 10 questões e a meta de 2 desafios por quinzena é recomendação, não limite.
-- dry_run_required: validar preservação de dados, sequência 1..N, compatibilidade com o Worker anterior e criação do desafio 3+.
-- rollback_plan_required: capturar recovery point D1 antes do apply. O novo campo é aditivo; após uso de desafios >2, rollback da aplicação deve manter o schema 0505.

ALTER TABLE conhecimento_ativo_desafios
  ADD COLUMN numero_sequencial INTEGER
  CHECK(numero_sequencial IS NULL OR numero_sequencial >= 1);

UPDATE conhecimento_ativo_desafios
SET numero_sequencial = numero_desafio
WHERE numero_sequencial IS NULL;

DROP INDEX IF EXISTS idx_ca_desafios_periodo_active;

CREATE UNIQUE INDEX idx_ca_desafios_periodo_active
  ON conhecimento_ativo_desafios(
    empresa_id, funcionario_id, aeronave_modelo, periodo_chave, numero_sequencial
  ) WHERE deleted_at IS NULL;

-- Compatibilidade durante a janela schema -> Worker: se o Worker anterior inserir
-- sem numero_sequencial, o valor legado (1 ou 2) é promovido automaticamente.
CREATE TRIGGER IF NOT EXISTS trg_ca_desafios_numero_sequencial_0505
AFTER INSERT ON conhecimento_ativo_desafios
WHEN NEW.numero_sequencial IS NULL BEGIN
  UPDATE conhecimento_ativo_desafios
  SET numero_sequencial = NEW.numero_desafio
  WHERE id = NEW.id AND empresa_id = NEW.empresa_id;
END;
