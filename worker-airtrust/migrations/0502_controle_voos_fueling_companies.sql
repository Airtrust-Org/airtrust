-- source_reference: Pilot App fueling UX and tenant-scoped supplier catalog requirements reviewed 2026-09-18.
-- operational_decision: fueling company is selected from a tenant-scoped active catalog; historical abastecimento keeps the supplier name in cv_voo_abastecimentos.fornecedor.
-- dry_run_required: validate the new catalog table locally and through Schema V2 before any remote apply.
-- rollback_plan_required: additive table only; use the D1 recovery point for failed apply or forward compensation for catalog entries.
CREATE TABLE IF NOT EXISTS cv_empresas_abastecimento (
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_cv_empresas_abastecimento_empresa_codigo
  ON cv_empresas_abastecimento (empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_empresas_abastecimento_empresa_ativo
  ON cv_empresas_abastecimento (empresa_id, ativo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cv_empresas_abastecimento_empresa_deleted
  ON cv_empresas_abastecimento (empresa_id, deleted_at);
