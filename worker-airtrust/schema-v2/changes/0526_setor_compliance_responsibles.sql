-- 0526_setor_compliance_responsibles.sql
-- Separates company operational access from sector responsibility for Training Compliance alerts.
-- source_reference: user-approved AirTrust RBAC/Compliance separation on 2026-10-02.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/setor-compliance-responsibles-0526.md

CREATE TABLE IF NOT EXISTS setores_responsaveis_compliance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  setor_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (setor_id) REFERENCES setores(id),
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id),
  UNIQUE (empresa_id, setor_id, funcionario_id)
);

CREATE INDEX IF NOT EXISTS idx_setores_resp_compliance_setor
  ON setores_responsaveis_compliance(empresa_id, setor_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_setores_resp_compliance_funcionario
  ON setores_responsaveis_compliance(empresa_id, funcionario_id, ativo)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_setores_resp_compliance_tenant_insert
BEFORE INSERT ON setores_responsaveis_compliance
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s
     WHERE s.id = NEW.setor_id
       AND s.empresa_id = NEW.empresa_id
       AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'setores_responsaveis_compliance: setor fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcionarios f
     WHERE f.id = NEW.funcionario_id
       AND f.empresa_id = NEW.empresa_id
       AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'setores_responsaveis_compliance: funcionario fora do tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_setores_resp_compliance_tenant_update
BEFORE UPDATE OF empresa_id, setor_id, funcionario_id ON setores_responsaveis_compliance
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM setores s
     WHERE s.id = NEW.setor_id
       AND s.empresa_id = NEW.empresa_id
       AND s.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'setores_responsaveis_compliance: setor fora do tenant') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM funcionarios f
     WHERE f.id = NEW.funcionario_id
       AND f.empresa_id = NEW.empresa_id
       AND f.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'setores_responsaveis_compliance: funcionario fora do tenant') END;
END;
