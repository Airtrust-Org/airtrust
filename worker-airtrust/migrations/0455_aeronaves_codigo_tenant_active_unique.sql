-- Migration 0455: scope aeronaves.codigo by tenant and active lifecycle.
-- source_reference: AUDITORIA_CONFIABILIDADE_RODADA3_20260803, achado Aeronaves UNIQUE global.
-- operational_decision: replace global table UNIQUE with active tenant-scoped partial uniqueness.
-- dry_run_required: yes; verify no duplicate active (empresa_id, codigo COLLATE NOCASE) pairs.
-- rollback_plan_required: yes; use scripts/rollback/0455_aeronaves_codigo_tenant_active_unique.sql after backup and preflight.
--
-- Root cause: migration 0396 rebuilt aeronaves with `codigo TEXT UNIQUE`, which
-- creates an unremovable global sqlite_autoindex. Soft-deleted rows therefore
-- block code reuse forever and one tenant can block another tenant.
--
-- Operational execution:
-- - run against a local D1 copy first;
-- - verify there are no duplicate ACTIVE (empresa_id, codigo) pairs;
-- - preserve a recovery point before any governed remote application;
-- - production application requires the repository's normal backup/recovery gate.

PRAGMA foreign_keys = OFF;

CREATE TABLE aeronaves_0455 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL,
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

INSERT INTO aeronaves_0455 (
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
)
SELECT
  id, codigo, modelo, fabricante, prefixo, ano_fabricacao,
  status, observacoes, created_at, updated_at, deleted_at, empresa_id
FROM aeronaves;

-- Fail before touching the source table when active duplicates exist. The index
-- remains attached after the table rename.
CREATE UNIQUE INDEX ux_aeronaves_empresa_codigo_active
  ON aeronaves_0455(empresa_id, codigo COLLATE NOCASE)
  WHERE deleted_at IS NULL;

DROP TABLE aeronaves;
ALTER TABLE aeronaves_0455 RENAME TO aeronaves;
CREATE INDEX idx_aeronaves_codigo ON aeronaves(codigo) WHERE deleted_at IS NULL;
CREATE INDEX idx_aeronaves_empresa ON aeronaves(empresa_id);
CREATE INDEX idx_aeronaves_status ON aeronaves(status) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;
