-- Structural support for the private AW139/S-76 final-matrix importer.
-- No catalogue data is loaded here. The controlled importer is tenant-scoped.
-- Rollback: DROP TABLE modelos_sessao_matriz_imports; DROP INDEX ...;

ALTER TABLE modelos_sessao ADD COLUMN versao_matriz TEXT;
ALTER TABLE modelos_sessao ADD COLUMN substituido_por_modelo_id INTEGER;
ALTER TABLE modelos_sessao ADD COLUMN efetivo_em TEXT;
ALTER TABLE modelos_sessao_manobras ADD COLUMN metadados_contextuais_json TEXT;

CREATE TABLE IF NOT EXISTS modelos_sessao_matriz_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  aeronave TEXT NOT NULL CHECK(aeronave IN ('AW139', 'SK76')),
  versao_matriz TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRY_RUN', 'APPLIED', 'ROLLED_BACK', 'FAILED')),
  snapshot_json TEXT NOT NULL,
  plano_json TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  rolled_back_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

CREATE INDEX IF NOT EXISTS idx_modelos_sessao_matriz_imports_tenant
  ON modelos_sessao_matriz_imports(empresa_id, aeronave, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_versao_matriz_tenant
  ON modelos_sessao(empresa_id, versao_matriz) WHERE deleted_at IS NULL;
