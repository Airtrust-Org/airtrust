-- 0494_training_enrollment_reconciliation.sql
-- Persist explicit reconciliation decisions for LMS enrollments that are intentionally
-- retained without becoming organization-wide compliance requirements.
-- Additive only: enrollment history and training requirements remain unchanged.

CREATE TABLE IF NOT EXISTS treinamento_matricula_reconciliacoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,
  decisao TEXT NOT NULL CHECK (decisao IN ('MANTER_AVULSA')),
  observacoes TEXT,
  decidido_por INTEGER,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_treinamento_matricula_reconciliacoes_active
  ON treinamento_matricula_reconciliacoes (empresa_id, matricula_id)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_treinamento_matricula_reconciliacoes_empresa
  ON treinamento_matricula_reconciliacoes (empresa_id, decisao)
  WHERE ativo = 1 AND deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_matricula_reconciliacoes_tenant_insert
BEFORE INSERT ON treinamento_matricula_reconciliacoes
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_matriculas m
     WHERE m.id = NEW.matricula_id AND m.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_matricula_reconciliacoes: matricula fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_treinamento_matricula_reconciliacoes_tenant_update
BEFORE UPDATE OF empresa_id, matricula_id ON treinamento_matricula_reconciliacoes
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_matriculas m
     WHERE m.id = NEW.matricula_id AND m.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'treinamento_matricula_reconciliacoes: matricula fora do tenant') END;
END;
