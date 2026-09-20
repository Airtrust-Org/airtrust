-- source_reference: Controle de Voos planning-vs-realized justification requirements reviewed 2026-09-20.
-- operational_decision: excess realized flight time must be explained with tenant-scoped registered justification codes and explicit minutes whose sum equals the positive planning deviation.
-- dry_run_required: validate additive tables, tenant triggers, uniqueness and zero impact to existing flights locally before remote apply.
-- rollback_plan_required: additive schema; use captured D1 Time Travel recovery point on failed apply or retain unused tables during application rollback.

CREATE TABLE IF NOT EXISTS cv_justificativas_voo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (ativo IN (0, 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_justificativas_voo_empresa_codigo
  ON cv_justificativas_voo (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_justificativas_voo_empresa_ativo
  ON cv_justificativas_voo (empresa_id, ativo, ordem)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS cv_voo_justificativas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  justificativa_id INTEGER NOT NULL,
  minutos INTEGER NOT NULL,
  observacao TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  CHECK (minutos > 0 AND minutos <= 1440),
  UNIQUE (empresa_id, voo_id, justificativa_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_voo_justificativas_empresa_voo
  ON cv_voo_justificativas (empresa_id, voo_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_justificativas_tenant_insert_0506
BEFORE INSERT ON cv_voo_justificativas
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM cv_voos v
    WHERE v.id = NEW.voo_id AND v.empresa_id = NEW.empresa_id AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight justification flight tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM cv_justificativas_voo j
    WHERE j.id = NEW.justificativa_id AND j.empresa_id = NEW.empresa_id
      AND j.ativo = 1 AND j.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight justification catalog tenant mismatch') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_cv_voo_justificativas_tenant_update_0506
BEFORE UPDATE OF empresa_id, voo_id, justificativa_id ON cv_voo_justificativas
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM cv_voos v
    WHERE v.id = NEW.voo_id AND v.empresa_id = NEW.empresa_id AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight justification flight tenant mismatch') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM cv_justificativas_voo j
    WHERE j.id = NEW.justificativa_id AND j.empresa_id = NEW.empresa_id
      AND j.ativo = 1 AND j.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'flight justification catalog tenant mismatch') END;
END;
