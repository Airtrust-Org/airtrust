-- Simulator matrix versioning.  This migration deliberately keeps
-- modelos_sessao.codigo as the globally-unique physical identity used by
-- legacy foreign keys.  The user-facing, tenant-scoped identity lives in the
-- version table below.  It is safe to apply only through the local migration
-- gate; it contains no AW139/S-76 catalogue data.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: schema snapshot local pré-0440 e contrato de matriz AW139/S-76,
--   conferidos sem conexão a D1 remoto.
-- operational_decision: reconstruir somente a tabela de vínculos para remover a
--   unicidade modelo/manobra; preservar IDs e posições históricas inclusive 19–22.
-- dry_run_required: executar o teste descartável 0440 e PRAGMA foreign_key_check
--   antes de qualquer aplicação local autorizada.
-- rollback_plan_required: usar simuladores_matriz_import_changes para dados; para
--   DDL, reverter em cópia local validada, sem apagar fichas ou sessões.
--
-- Rollback (after verifying no import is APPLIED): drop the triggers and
-- indexes below, then drop the four new tables. Do not delete session/ficha
-- history; their FK target is modelos_sessao and remains untouched.

-- The final LOFT matrices intentionally use the same manoeuvre code twice in
-- a model (one per leg). The old UNIQUE(modelo_id, manobra_id) cannot encode
-- that. Preserve every row and make execution position the unique identity.
-- Preflight must complete before the legacy table is touched. Historical
-- positions 19–22 are valid and are intentionally not constrained here.
CREATE TEMP TABLE _0440_preflight (
  ok INTEGER NOT NULL CHECK(ok = 1)
);
INSERT INTO _0440_preflight(ok)
SELECT CASE WHEN
  NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras
    WHERE ordem IS NULL OR tripulante NOT IN ('A', 'B', 'AB')
  )
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm
    LEFT JOIN modelos_sessao ms ON ms.id = msm.modelo_id
    LEFT JOIN manobras m ON m.id = msm.manobra_id
    WHERE ms.id IS NULL OR m.id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras
    WHERE deleted_at IS NULL
    GROUP BY modelo_id, ordem
    HAVING COUNT(*) > 1
  )
THEN 1 ELSE 0 END;
DROP TABLE _0440_preflight;
DROP TRIGGER IF EXISTS trigger_modelos_sessao_manobras_updated_at;
CREATE TABLE modelos_sessao_manobras_0440 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  obrigatoria BOOLEAN DEFAULT 1,
  observacoes TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME,
  created_by TEXT,
  updated_by TEXT,
  tripulante TEXT NOT NULL DEFAULT 'AB' CHECK(tripulante IN ('A','B','AB','PFA','PMB','PFB','PMA')),
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id) ON DELETE CASCADE,
  FOREIGN KEY (manobra_id) REFERENCES manobras(id) ON DELETE CASCADE
  -- Repeated manoeuvre codes are valid across LOFT legs. Active execution
  -- order, rather than manoeuvre identity, is the unique relationship.
);
INSERT INTO modelos_sessao_manobras_0440
  (id, modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at, deleted_at, created_by, updated_by, tripulante)
SELECT id, modelo_id, manobra_id, ordem, obrigatoria, observacoes, created_at, updated_at, deleted_at, created_by, updated_by, tripulante
FROM modelos_sessao_manobras;
DROP TABLE modelos_sessao_manobras;
ALTER TABLE modelos_sessao_manobras_0440 RENAME TO modelos_sessao_manobras;
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX IF NOT EXISTS idx_modelos_sessao_manobras_modelo_ordem ON modelos_sessao_manobras(modelo_id, ordem) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelos_sessao_manobras_ordem_ativa ON modelos_sessao_manobras(modelo_id, ordem) WHERE deleted_at IS NULL;
CREATE TRIGGER IF NOT EXISTS trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS modelos_sessao_versionamento (
  modelo_id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo_canonico TEXT NOT NULL COLLATE NOCASE,
  versao_numero INTEGER NOT NULL CHECK(versao_numero >= 1),
  versao_matriz TEXT NOT NULL DEFAULT 'LEGACY',
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0, 1)),
  modelo_anterior_id INTEGER,
  efetivo_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  efetivo_ate TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (modelo_anterior_id) REFERENCES modelos_sessao(id),
  CHECK(efetivo_ate IS NULL OR efetivo_ate >= efetivo_em),
  CHECK(modelo_anterior_id IS NULL OR modelo_anterior_id <> modelo_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_modelo_canonico_corrente_tenant
  ON modelos_sessao_versionamento(empresa_id, codigo_canonico)
  WHERE is_current = 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_modelo_canonico_versao_tenant
  ON modelos_sessao_versionamento(empresa_id, codigo_canonico, versao_numero);
CREATE INDEX IF NOT EXISTS idx_modelo_versionamento_anterior
  ON modelos_sessao_versionamento(modelo_anterior_id);

-- Existing models become explicit legacy current versions. New imports use a
-- physical code such as A139-I-01/12@M2026.07-V2, while displaying the exact
-- canonical code A139-I-01/12.
INSERT INTO modelos_sessao_versionamento (modelo_id, empresa_id, codigo_canonico, versao_numero, versao_matriz, is_current)
SELECT id, empresa_id, codigo, 1, 'LEGACY', 1
FROM modelos_sessao
WHERE empresa_id IS NOT NULL
  AND deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento v WHERE v.modelo_id = modelos_sessao.id
  );

CREATE TRIGGER IF NOT EXISTS trg_modelo_versao_mesmo_tenant_insert
BEFORE INSERT ON modelos_sessao_versionamento
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM modelos_sessao ms WHERE ms.id = NEW.modelo_id AND ms.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'modelo e empresa divergentes') END;
  SELECT CASE WHEN NEW.modelo_anterior_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento previous
    WHERE previous.modelo_id = NEW.modelo_anterior_id AND previous.empresa_id = NEW.empresa_id AND previous.codigo_canonico = NEW.codigo_canonico AND previous.versao_numero < NEW.versao_numero
  ) THEN RAISE(ABORT, 'modelo anterior inexistente ou pertence a outro tenant') END;
  SELECT CASE WHEN NEW.is_current = 1 AND NEW.efetivo_ate IS NOT NULL THEN RAISE(ABORT, 'versão corrente não pode ter término') END;
  SELECT CASE WHEN NEW.is_current = 0 AND NEW.efetivo_ate IS NULL THEN RAISE(ABORT, 'versão histórica exige término') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_modelo_versao_sem_ciclo_insert
BEFORE INSERT ON modelos_sessao_versionamento
WHEN NEW.modelo_anterior_id IS NOT NULL
BEGIN
  WITH RECURSIVE ancestors(id) AS (
    SELECT NEW.modelo_anterior_id
    UNION ALL
    SELECT v.modelo_anterior_id FROM modelos_sessao_versionamento v
    JOIN ancestors a ON a.id = v.modelo_id
    WHERE v.modelo_anterior_id IS NOT NULL
  )
  SELECT CASE WHEN EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.modelo_id)
    THEN RAISE(ABORT, 'cadeia de versoes ciclica') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_modelo_versao_integridade_update
BEFORE UPDATE ON modelos_sessao_versionamento
BEGIN
  SELECT CASE WHEN NEW.modelo_id <> OLD.modelo_id
    OR NEW.empresa_id <> OLD.empresa_id
    OR NEW.codigo_canonico <> OLD.codigo_canonico
    OR NEW.versao_numero <> OLD.versao_numero
    OR NEW.versao_matriz <> OLD.versao_matriz
    OR COALESCE(NEW.modelo_anterior_id, -1) <> COALESCE(OLD.modelo_anterior_id, -1)
    OR NEW.efetivo_em <> OLD.efetivo_em
    OR NEW.created_at <> OLD.created_at
    THEN RAISE(ABORT, 'identidade de versão é imutável') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM modelos_sessao ms WHERE ms.id = NEW.modelo_id AND ms.empresa_id = NEW.empresa_id)
    THEN RAISE(ABORT, 'modelo e empresa divergentes') END;
  SELECT CASE WHEN NEW.is_current = 1 AND NEW.efetivo_ate IS NOT NULL THEN RAISE(ABORT, 'versão corrente não pode ter término') END;
  SELECT CASE WHEN NEW.is_current = 0 AND NEW.efetivo_ate IS NULL THEN RAISE(ABORT, 'versão histórica exige término') END;
  SELECT CASE WHEN NEW.modelo_anterior_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM modelos_sessao_versionamento previous
    WHERE previous.modelo_id = NEW.modelo_anterior_id AND previous.empresa_id = NEW.empresa_id
      AND previous.codigo_canonico = NEW.codigo_canonico AND previous.versao_numero < NEW.versao_numero
  ) THEN RAISE(ABORT, 'predecessor inválido') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_modelo_versao_updated_at
AFTER UPDATE OF is_current, efetivo_ate ON modelos_sessao_versionamento
FOR EACH ROW BEGIN
  UPDATE modelos_sessao_versionamento SET updated_at = CURRENT_TIMESTAMP WHERE modelo_id = NEW.modelo_id;
END;

CREATE TABLE IF NOT EXISTS modelos_sessao_manobras_contexto (
  modelo_manobra_id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  metadados_json TEXT NOT NULL CHECK(json_valid(metadados_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (modelo_manobra_id) REFERENCES modelos_sessao_manobras(id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
CREATE INDEX IF NOT EXISTS idx_modelo_manobra_contexto_tenant
  ON modelos_sessao_manobras_contexto(empresa_id);
CREATE TRIGGER IF NOT EXISTS trg_modelo_manobra_contexto_tenant_insert
BEFORE INSERT ON modelos_sessao_manobras_contexto
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id
    WHERE msm.id = NEW.modelo_manobra_id AND ms.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'contexto e vínculo pertencem a tenants diferentes') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_modelo_manobra_contexto_tenant_update
BEFORE UPDATE ON modelos_sessao_manobras_contexto
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM modelos_sessao_manobras msm JOIN modelos_sessao ms ON ms.id = msm.modelo_id
    WHERE msm.id = NEW.modelo_manobra_id AND ms.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'contexto e vínculo pertencem a tenants diferentes') END;
END;

CREATE TABLE IF NOT EXISTS simuladores_matriz_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  versao_matriz TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRY_RUN', 'APPLYING', 'APPLIED', 'ROLLED_BACK', 'FAILED')),
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256) = 64),
  source_hashes_json TEXT NOT NULL CHECK(json_valid(source_hashes_json) AND length(source_hashes_json) <= 32768),
  base_fingerprint TEXT NOT NULL CHECK(length(base_fingerprint) = 64),
  expected_counts_json TEXT NOT NULL CHECK(json_valid(expected_counts_json) AND length(expected_counts_json) <= 8192),
  applied_counts_json TEXT CHECK(applied_counts_json IS NULL OR (json_valid(applied_counts_json) AND length(applied_counts_json) <= 8192)),
  requested_by INTEGER,
  correlation_id TEXT,
  failure_reason TEXT,
  rollback_uuid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  rolled_back_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_imports_tenant
  ON simuladores_matriz_imports(empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS simuladores_matriz_import_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL,
  entidade TEXT NOT NULL,
  entity_id INTEGER,
  operacao TEXT NOT NULL CHECK(operacao IN ('INSERT', 'UPDATE', 'INACTIVATE', 'REACTIVATE')),
  before_json TEXT CHECK(before_json IS NULL OR (json_valid(before_json) AND length(before_json) <= 65536)),
  after_json TEXT CHECK(after_json IS NULL OR (json_valid(after_json) AND length(after_json) <= 65536)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (import_id) REFERENCES simuladores_matriz_imports(id)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_changes_import
  ON simuladores_matriz_import_changes(import_id, entidade);
