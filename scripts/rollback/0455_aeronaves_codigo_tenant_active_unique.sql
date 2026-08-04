-- Rollback 0455. This can only succeed while codigo remains globally unique.
-- source_reference: worker-airtrust/migrations/0455_aeronaves_codigo_tenant_active_unique.sql.
-- operational_decision: restore the pre-0455 global uniqueness contract only for an approved rollback.
-- dry_run_required: yes; verify global codigo uniqueness, including soft-deleted rows, before execution.
-- rollback_plan_required: yes; take a recovery point and use the repository's controlled rollback procedure.
-- Run the duplicate preflight before rollback; do not apply blindly in production.

PRAGMA foreign_keys = OFF;

CREATE TABLE aeronaves_0455_rollback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  modelo TEXT NOT NULL,
  fabricante TEXT,
  prefixo TEXT,
  ano_fabricacao INTEGER,
  status TEXT DEFAULT 'ATIVO',
  observacoes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  empresa_id INTEGER NOT NULL
);

INSERT INTO aeronaves_0455_rollback (
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
)
SELECT
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
FROM aeronaves;

DROP TABLE aeronaves;
ALTER TABLE aeronaves_0455_rollback RENAME TO aeronaves;
CREATE INDEX idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_aeronaves_empresa ON aeronaves(empresa_id);
CREATE INDEX idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
