-- Compensatory remediation for LEGACY_EQUIVALENT resolutions that were
-- imported as TRUE_MISSING/COLLISION (i.e. a brand-new manobra was created
-- when an existing legacy manobra should have been reused). Purely additive:
-- does not touch modelos_sessao, manobras, modelos_sessao_manobras,
-- modelos_sessao_versionamento, simuladores_matriz_manobra_resolution or any
-- table from migrations 0440/0441/0442.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
-- source_reference: nenhum dado de tenant é inserido por esta migration.
-- operational_decision: simuladores_matriz_manobra_resolution é imutável por
--   trigger (trg_matriz_manobra_resolution_imutavel); a correção efetiva vive
--   num overlay append-only (simuladores_matriz_resolution_corrections) que
--   nunca sobrescreve a resolução histórica do import original.
-- dry_run_required: nenhuma escrita de dados por esta migration; as tabelas
--   são populadas apenas pelo executor
--   worker-airtrust/src/routes/admin-simuladores-matriz-remediation-executor.ts.
-- rollback_plan_required: DROP dos triggers e das três tabelas abaixo; nenhuma
--   outra tabela é afetada. Nenhum import/remediação pode estar em estado
--   APPLYING no momento do rollback desta migration.

CREATE TABLE IF NOT EXISTS simuladores_matriz_remediations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remediation_uuid TEXT NOT NULL UNIQUE,
  empresa_id INTEGER NOT NULL,
  remediation_type TEXT NOT NULL CHECK(remediation_type IN ('LEGACY_EQUIVALENT_COMPENSATION')),
  source_matrix_import_uuid TEXT NOT NULL,
  source_guide_import_uuid TEXT NOT NULL,
  versao_matriz TEXT NOT NULL,
  expected_hash TEXT NOT NULL CHECK(length(expected_hash) = 64),
  base_fingerprint TEXT NOT NULL CHECK(length(base_fingerprint) = 64),
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256) = 64),
  status TEXT NOT NULL CHECK(status IN ('APPLYING', 'APPLIED', 'ROLLED_BACK', 'FAILED')),
  model_count INTEGER NOT NULL CHECK(model_count >= 0),
  link_count INTEGER NOT NULL CHECK(link_count >= 0),
  mapping_count INTEGER NOT NULL CHECK(mapping_count >= 0),
  effective_exact_unique INTEGER,
  effective_legacy_equivalent INTEGER,
  effective_true_missing INTEGER,
  created_by INTEGER,
  failure_reason TEXT,
  rollback_uuid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  rolled_back_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (source_matrix_import_uuid) REFERENCES simuladores_matriz_imports(uuid),
  FOREIGN KEY (source_guide_import_uuid) REFERENCES simuladores_matriz_guia_relink(uuid)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_remediations_tenant
  ON simuladores_matriz_remediations(empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_remediations_status
  ON simuladores_matriz_remediations(empresa_id, versao_matriz, status);

-- At most one non-terminal (APPLYING) remediation per tenant/versao_matriz at
-- a time: partial unique index enforces the single-flight gate required by
-- section 9 without any application-level locking.
CREATE UNIQUE INDEX IF NOT EXISTS uq_simuladores_matriz_remediations_inflight
  ON simuladores_matriz_remediations(empresa_id, versao_matriz)
  WHERE status = 'APPLYING';

CREATE TRIGGER IF NOT EXISTS trg_simuladores_matriz_remediation_identity_update
BEFORE UPDATE ON simuladores_matriz_remediations
WHEN NEW.id <> OLD.id
  OR NEW.remediation_uuid <> OLD.remediation_uuid
  OR NEW.empresa_id <> OLD.empresa_id
  OR NEW.remediation_type <> OLD.remediation_type
  OR NEW.source_matrix_import_uuid <> OLD.source_matrix_import_uuid
  OR NEW.source_guide_import_uuid <> OLD.source_guide_import_uuid
  OR NEW.versao_matriz <> OLD.versao_matriz
  OR NEW.expected_hash <> OLD.expected_hash
  OR NEW.base_fingerprint <> OLD.base_fingerprint
  OR NEW.plan_sha256 <> OLD.plan_sha256
  OR NEW.model_count <> OLD.model_count
  OR NEW.link_count <> OLD.link_count
  OR NEW.mapping_count <> OLD.mapping_count
  OR COALESCE(NEW.created_by, -1) <> COALESCE(OLD.created_by, -1)
  OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'identidade da remediação é imutável');
END;

CREATE TRIGGER IF NOT EXISTS trg_simuladores_matriz_remediation_state_update
BEFORE UPDATE ON simuladores_matriz_remediations
BEGIN
  SELECT CASE WHEN OLD.status = 'ROLLED_BACK' AND NOT (
    NEW.status IS OLD.status
    AND COALESCE(NEW.failure_reason, '') IS COALESCE(OLD.failure_reason, '')
    AND COALESCE(NEW.applied_at, '') IS COALESCE(OLD.applied_at, '')
    AND COALESCE(NEW.rolled_back_at, '') IS COALESCE(OLD.rolled_back_at, '')
    AND COALESCE(NEW.rollback_uuid, '') IS COALESCE(OLD.rollback_uuid, '')
    AND NEW.updated_at = CURRENT_TIMESTAMP
  ) THEN RAISE(ABORT, 'remediação ROLLED_BACK é terminal e imutável') END;
  SELECT CASE WHEN NEW.status <> OLD.status AND NOT (
    (OLD.status = 'APPLYING' AND NEW.status IN ('APPLIED', 'FAILED')) OR
    (OLD.status = 'APPLIED' AND NEW.status = 'ROLLED_BACK') OR
    (OLD.status = 'FAILED' AND NEW.status = 'APPLYING')
  ) THEN RAISE(ABORT, 'transição de status da remediação inválida') END;
  SELECT CASE WHEN NEW.status = 'APPLIED' AND (
    NEW.applied_at IS NULL
    OR (NEW.failure_reason IS NOT NULL AND length(trim(NEW.failure_reason)) > 0)
  ) THEN RAISE(ABORT, 'invariante APPLIED violada') END;
  SELECT CASE WHEN NEW.status = 'FAILED' AND (
    NEW.failure_reason IS NULL OR length(trim(NEW.failure_reason)) = 0
    OR NEW.applied_at IS NOT NULL OR NEW.rolled_back_at IS NOT NULL OR NEW.rollback_uuid IS NOT NULL
  ) THEN RAISE(ABORT, 'invariante FAILED violada') END;
  SELECT CASE WHEN NEW.status = 'ROLLED_BACK' AND (
    NEW.rolled_back_at IS NULL OR NEW.rollback_uuid IS NULL
  ) THEN RAISE(ABORT, 'invariante ROLLED_BACK violada') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_simuladores_matriz_remediation_updated_at
AFTER UPDATE ON simuladores_matriz_remediations
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE simuladores_matriz_remediations SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TABLE IF NOT EXISTS simuladores_matriz_remediation_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remediation_id INTEGER NOT NULL,
  change_order INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN (
    'modelos_sessao', 'modelos_sessao_versionamento', 'modelos_sessao_manobras',
    'simuladores_modelos_sessao_guias', 'simuladores_matriz_resolution_corrections',
    'manobras'
  )),
  action_type TEXT NOT NULL CHECK(action_type IN (
    'COMPENSATE_CREATE', 'COMPENSATE_INACTIVATE', 'LINK_COPY', 'LINK_SUBSTITUTE',
    'GUIDE_RELINK', 'RESOLUTION_OVERLAY', 'MANOBRA_SUPERSEDE'
  )),
  logical_code TEXT NOT NULL,
  before_id INTEGER,
  after_id INTEGER,
  before_hash TEXT,
  after_hash TEXT,
  metadata_json TEXT CHECK(metadata_json IS NULL OR (json_valid(metadata_json) AND length(metadata_json) <= 8192)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (remediation_id) REFERENCES simuladores_matriz_remediations(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_simuladores_matriz_remediation_changes_order
  ON simuladores_matriz_remediation_changes(remediation_id, change_order);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_remediation_changes_code
  ON simuladores_matriz_remediation_changes(remediation_id, logical_code);

CREATE TRIGGER IF NOT EXISTS trg_simuladores_matriz_remediation_changes_imutavel
BEFORE UPDATE ON simuladores_matriz_remediation_changes
BEGIN
  SELECT RAISE(ABORT, 'auditoria de remediação é imutável');
END;

-- Append-only overlay of the effective manobra_id per canonical code. The
-- underlying simuladores_matriz_manobra_resolution row is never rewritten;
-- this table only records which correction currently supersedes it. Reading
-- the "effective resolution" for a code means: overlay row where
-- is_current=1, falling back to the original resolution when no overlay
-- exists.
CREATE TABLE IF NOT EXISTS simuladores_matriz_resolution_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  versao_matriz TEXT NOT NULL,
  codigo_canonico TEXT NOT NULL,
  original_resolution_id INTEGER NOT NULL,
  original_resolution_type TEXT NOT NULL,
  original_manobra_id INTEGER NOT NULL,
  corrected_resolution_type TEXT NOT NULL CHECK(corrected_resolution_type IN ('LEGACY_EQUIVALENT')),
  corrected_manobra_id INTEGER NOT NULL,
  remediation_id INTEGER NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK(is_current IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at TEXT,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (original_resolution_id) REFERENCES simuladores_matriz_manobra_resolution(id),
  FOREIGN KEY (original_manobra_id) REFERENCES manobras(id),
  FOREIGN KEY (corrected_manobra_id) REFERENCES manobras(id),
  FOREIGN KEY (remediation_id) REFERENCES simuladores_matriz_remediations(id),
  CHECK(is_current = 1 OR superseded_at IS NOT NULL),
  CHECK(is_current = 0 OR superseded_at IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_simuladores_matriz_resolution_corrections_tenant
  ON simuladores_matriz_resolution_corrections(empresa_id, versao_matriz);
CREATE UNIQUE INDEX IF NOT EXISTS uq_simuladores_matriz_resolution_corrections_current
  ON simuladores_matriz_resolution_corrections(empresa_id, versao_matriz, codigo_canonico)
  WHERE is_current = 1;

CREATE TRIGGER IF NOT EXISTS trg_matriz_resolution_corrections_mesmo_tenant
BEFORE INSERT ON simuladores_matriz_resolution_corrections
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM manobras m WHERE m.id = NEW.original_manobra_id AND m.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'original_manobra_id pertence a tenant diferente') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM manobras m WHERE m.id = NEW.corrected_manobra_id AND m.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'corrected_manobra_id pertence a tenant diferente') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM simuladores_matriz_manobra_resolution r
    WHERE r.id = NEW.original_resolution_id AND r.empresa_id = NEW.empresa_id
      AND r.versao_matriz = NEW.versao_matriz AND r.codigo_canonico = NEW.codigo_canonico
      AND r.manobra_id = NEW.original_manobra_id AND r.resolution_type = NEW.original_resolution_type
  ) THEN RAISE(ABORT, 'original_resolution_id não corresponde à resolução histórica') END;
END;

-- A correction row is an audited historical fact once written: only its own
-- supersession (is_current 1->0 plus superseded_at) may ever change it.
CREATE TRIGGER IF NOT EXISTS trg_matriz_resolution_corrections_imutavel
BEFORE UPDATE ON simuladores_matriz_resolution_corrections
WHEN NOT (
  OLD.is_current = 1 AND NEW.is_current = 0
  AND NEW.superseded_at IS NOT NULL
  AND NEW.id = OLD.id AND NEW.empresa_id = OLD.empresa_id AND NEW.versao_matriz = OLD.versao_matriz
  AND NEW.codigo_canonico = OLD.codigo_canonico
  AND NEW.original_resolution_id = OLD.original_resolution_id
  AND NEW.original_resolution_type = OLD.original_resolution_type
  AND NEW.original_manobra_id = OLD.original_manobra_id
  AND NEW.corrected_resolution_type = OLD.corrected_resolution_type
  AND NEW.corrected_manobra_id = OLD.corrected_manobra_id
  AND NEW.remediation_id = OLD.remediation_id
  AND NEW.created_at = OLD.created_at
)
BEGIN
  SELECT RAISE(ABORT, 'correção de resolução é imutável exceto supersessão auditada');
END;
