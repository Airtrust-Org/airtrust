-- operational_decision: cada desafio de Conhecimento Ativo passa a ter 10 questões, escolhido por aeronave e área; a meta de 2 desafios por quinzena é recomendação, não limite.
-- dry_run_required: validar preservação de dados, sequência 1..N, seleção por tópico, compatibilidade com o Worker anterior e criação do desafio 3+.
-- rollback_plan_required: capturar recovery point D1 antes do apply. Os novos campos são aditivos; após uso de desafios >2/tópico, rollback da aplicação deve manter o schema 0505.

ALTER TABLE conhecimento_ativo_desafios
  ADD COLUMN numero_sequencial INTEGER
  CHECK(numero_sequencial IS NULL OR numero_sequencial >= 1);

ALTER TABLE conhecimento_ativo_desafios
  ADD COLUMN topico_id INTEGER;

UPDATE conhecimento_ativo_desafios
SET numero_sequencial = numero_desafio
WHERE numero_sequencial IS NULL;

DROP INDEX IF EXISTS idx_ca_desafios_periodo_active;

CREATE UNIQUE INDEX idx_ca_desafios_periodo_active
  ON conhecimento_ativo_desafios(
    empresa_id, funcionario_id, aeronave_modelo, periodo_chave, numero_sequencial
  ) WHERE deleted_at IS NULL;

CREATE INDEX idx_ca_desafios_topico_active
  ON conhecimento_ativo_desafios(
    empresa_id, funcionario_id, aeronave_modelo, periodo_chave, topico_id, status
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

-- Um desafio novo pode apontar somente para um tópico ativo do mesmo tenant.
-- Registros antigos permanecem com topico_id NULL para compatibilidade histórica.
CREATE TRIGGER IF NOT EXISTS trg_ca_desafios_topico_tenant_0505_insert
BEFORE INSERT ON conhecimento_ativo_desafios
WHEN NEW.topico_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_topicos t
    WHERE t.id=NEW.topico_id AND t.empresa_id=NEW.empresa_id
      AND t.ativo=1 AND t.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo challenge topic tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_ca_desafios_topico_tenant_0505_update
BEFORE UPDATE OF topico_id ON conhecimento_ativo_desafios
WHEN NEW.topico_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM conhecimento_ativo_topicos t
    WHERE t.id=NEW.topico_id AND t.empresa_id=NEW.empresa_id
      AND t.ativo=1 AND t.deleted_at IS NULL
  ) THEN RAISE(ABORT,'conhecimento ativo challenge topic tenant mismatch') END;
END;
