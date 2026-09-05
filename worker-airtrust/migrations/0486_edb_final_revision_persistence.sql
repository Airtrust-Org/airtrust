-- 0486 — eDB immutable final revision and local signature persistence
--
-- Additive local persistence for immutable final-record revisions, local
-- lifecycle state and final PIC/operator signature evidence. No ANAC transport,
-- receipt, acceptance or queue state is created here.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: current-main EdbFlightRecord contract, persisted-record validation, regulated lifecycle and signature ceremony; stacked after 0485 technical-awareness persistence.
--   operational_decision: persist immutable local final revisions and only the current local lifecycle statuses DRAFT/READY_FOR_PIC_SIGNATURE/PIC_SIGNED/OPERATOR_SIGNED/SUPERSEDED/CANCELLED.
--   dry_run_required: validate Schema V2 hashes and disposable-local SQLite invariants before any governed remote apply.
--   rollback_plan_required: worker-airtrust/schema-v2/plans/edb-final-revision-persistence-0486.md (application rollback is sufficient while unused; physical removal requires a separately reviewed change).
--

CREATE TABLE IF NOT EXISTS edb_registro_revisoes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  volume_id TEXT NOT NULL,
  logical_record_id TEXT NOT NULL CHECK (length(trim(logical_record_id)) > 0),
  revisao INTEGER NOT NULL CHECK (typeof(revisao) = 'integer' AND revisao >= 1),
  supersedes_revision_id TEXT,
  motivo_correcao TEXT,
  contract_version TEXT NOT NULL CHECK (contract_version = 'edb.regulatory.v1'),
  voo_id INTEGER NOT NULL,
  rdv_id INTEGER,
  rdv_versao INTEGER,
  etapa_id INTEGER NOT NULL,
  ciencia_tecnica_pic_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  canonical_payload_sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL CHECK (datetime(captured_at) IS NOT NULL),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    length(canonical_payload_sha256) = 64
    AND canonical_payload_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (
    (revisao = 1 AND supersedes_revision_id IS NULL)
    OR
    (revisao > 1
      AND supersedes_revision_id IS NOT NULL
      AND length(trim(supersedes_revision_id)) > 0
      AND motivo_correcao IS NOT NULL
      AND length(trim(motivo_correcao)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_revisoes_logical_revision
  ON edb_registro_revisoes (empresa_id, logical_record_id, revisao);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_revisoes_stage_revision
  ON edb_registro_revisoes (empresa_id, voo_id, etapa_id, revisao);

CREATE INDEX IF NOT EXISTS idx_edb_revisoes_flight
  ON edb_registro_revisoes (empresa_id, voo_id, etapa_id, created_at);

CREATE TABLE IF NOT EXISTS edb_registro_estado (
  revision_id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT',
    'READY_FOR_PIC_SIGNATURE',
    'PIC_SIGNED',
    'OPERATOR_SIGNED',
    'SUPERSEDED',
    'CANCELLED'
  )),
  versao INTEGER NOT NULL DEFAULT 1 CHECK (typeof(versao) = 'integer' AND versao >= 1),
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_edb_estado_tenant_status
  ON edb_registro_estado (empresa_id, status, updated_at);

CREATE TABLE IF NOT EXISTS edb_assinaturas (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  revision_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('PIC_FLIGHT_RECORD', 'OPERATOR_RECORD')),
  signer_funcionario_id INTEGER,
  signer_user_id INTEGER,
  signer_nome TEXT NOT NULL CHECK (length(trim(signer_nome)) > 0),
  signer_codigo_anac TEXT,
  signed_at TEXT NOT NULL CHECK (datetime(signed_at) IS NOT NULL),
  canonical_payload_sha256 TEXT NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN (
    'ASYMMETRIC_DIGITAL_SIGNATURE',
    'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE'
  )),
  proof_reference TEXT NOT NULL CHECK (length(trim(proof_reference)) > 0),
  auth_evidence_json TEXT CHECK (auth_evidence_json IS NULL OR json_valid(auth_evidence_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    length(canonical_payload_sha256) = 64
    AND canonical_payload_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_assinaturas_revision_type
  ON edb_assinaturas (empresa_id, revision_id, tipo);

CREATE INDEX IF NOT EXISTS idx_edb_assinaturas_revision_time
  ON edb_assinaturas (empresa_id, revision_id, signed_at);

CREATE TRIGGER IF NOT EXISTS trg_edb_revision_require_scope
BEFORE INSERT ON edb_registro_revisoes
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_diarios d
    WHERE d.id = NEW.diario_id AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_REVISION_DIARY_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_volumes v
    WHERE v.id = NEW.volume_id
      AND v.empresa_id = NEW.empresa_id
      AND v.diario_id = NEW.diario_id
      AND v.status = 'OPEN'
  ) THEN RAISE(ABORT, 'EDB_REVISION_VOLUME_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cv_voos v
    WHERE v.id = NEW.voo_id
      AND v.empresa_id = NEW.empresa_id
      AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'EDB_REVISION_FLIGHT_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM cv_voo_etapas e
    WHERE e.id = NEW.etapa_id
      AND e.empresa_id = NEW.empresa_id
      AND e.voo_id = NEW.voo_id
      AND e.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'EDB_REVISION_STAGE_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_ciencias_tecnicas_pic c
    WHERE c.id = NEW.ciencia_tecnica_pic_id
      AND c.empresa_id = NEW.empresa_id
      AND c.voo_id = NEW.voo_id
  ) THEN RAISE(ABORT, 'EDB_REVISION_TECHNICAL_ACK_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revision_payload_binding
BEFORE INSERT ON edb_registro_revisoes
BEGIN
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.contractVersion') <> NEW.contract_version
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_CONTRACT_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.identity.operatorCompanyId') <> NEW.empresa_id
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_TENANT_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.logicalRecordId') <> NEW.logical_record_id
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_LOGICAL_ID_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.revisionId') <> NEW.id
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_REVISION_ID_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.status') <> 'DRAFT'
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_MUST_START_DRAFT') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.source.sourceFlightId') <> NEW.voo_id
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_FLIGHT_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.source.sourceStageId') <> NEW.etapa_id
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_STAGE_MISMATCH') END;
  SELECT CASE WHEN json_extract(NEW.payload_json, '$.correction.revision') <> NEW.revisao
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_NUMBER_MISMATCH') END;
  SELECT CASE WHEN COALESCE(json_extract(NEW.payload_json, '$.correction.supersedesRevisionId'), '') <> COALESCE(NEW.supersedes_revision_id, '')
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_SUPERSEDES_MISMATCH') END;
  SELECT CASE WHEN COALESCE(json_extract(NEW.payload_json, '$.correction.correctionReason'), '') <> COALESCE(NEW.motivo_correcao, '')
    THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_CORRECTION_REASON_MISMATCH') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_ciencias_tecnicas_pic c
    WHERE c.id = NEW.ciencia_tecnica_pic_id
      AND c.empresa_id = NEW.empresa_id
      AND c.voo_id = NEW.voo_id
      AND c.id = json_extract(NEW.payload_json, '$.signatures.picTechnicalAcknowledgement.signatureId')
      AND c.situacao_tecnica_id = json_extract(NEW.payload_json, '$.signatures.picTechnicalAcknowledgement.targetId')
      AND c.canonical_snapshot_sha256 = json_extract(NEW.payload_json, '$.signatures.picTechnicalAcknowledgement.canonicalPayloadHashSha256')
  ) THEN RAISE(ABORT, 'EDB_REVISION_PAYLOAD_TECHNICAL_ACK_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revision_supersession_chain
BEFORE INSERT ON edb_registro_revisoes
WHEN NEW.revisao > 1
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_registro_revisoes previous
    WHERE previous.id = NEW.supersedes_revision_id
      AND previous.empresa_id = NEW.empresa_id
      AND previous.logical_record_id = NEW.logical_record_id
      AND previous.revisao = NEW.revisao - 1
  ) THEN RAISE(ABORT, 'EDB_REVISION_SUPERSESSION_CHAIN_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revision_no_update
BEFORE UPDATE ON edb_registro_revisoes
BEGIN
  SELECT RAISE(ABORT, 'EDB_REVISION_UPDATE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_revision_no_delete
BEFORE DELETE ON edb_registro_revisoes
BEGIN
  SELECT RAISE(ABORT, 'EDB_REVISION_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_state_require_revision
BEFORE INSERT ON edb_registro_estado
BEGIN
  SELECT CASE WHEN NEW.status <> 'DRAFT' OR NEW.versao <> 1
    THEN RAISE(ABORT, 'EDB_STATE_MUST_START_DRAFT_V1') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_registro_revisoes r
    WHERE r.id = NEW.revision_id AND r.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_STATE_REVISION_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_state_transition_guard
BEFORE UPDATE OF status, versao ON edb_registro_estado
BEGIN
  SELECT CASE WHEN NEW.versao <> OLD.versao + 1
    THEN RAISE(ABORT, 'EDB_STATE_VERSION_MUST_INCREMENT') END;

  SELECT CASE WHEN NOT (
    (OLD.status = 'DRAFT' AND NEW.status IN ('READY_FOR_PIC_SIGNATURE', 'CANCELLED'))
    OR (OLD.status = 'READY_FOR_PIC_SIGNATURE' AND NEW.status IN ('PIC_SIGNED', 'CANCELLED'))
    OR (OLD.status = 'PIC_SIGNED' AND NEW.status IN ('OPERATOR_SIGNED', 'SUPERSEDED'))
    OR (OLD.status = 'OPERATOR_SIGNED' AND NEW.status = 'SUPERSEDED')
  ) THEN RAISE(ABORT, 'EDB_STATE_TRANSITION_NOT_ALLOWED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_state_identity_immutable
BEFORE UPDATE OF revision_id, empresa_id ON edb_registro_estado
WHEN NEW.revision_id <> OLD.revision_id OR NEW.empresa_id <> OLD.empresa_id
BEGIN
  SELECT RAISE(ABORT, 'EDB_STATE_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_state_no_delete
BEFORE DELETE ON edb_registro_estado
BEGIN
  SELECT RAISE(ABORT, 'EDB_STATE_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_signature_require_revision_state
BEFORE INSERT ON edb_assinaturas
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM edb_registro_revisoes r
    WHERE r.id = NEW.revision_id AND r.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_SIGNATURE_REVISION_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.tipo = 'PIC_FLIGHT_RECORD' AND NOT EXISTS (
    SELECT 1 FROM edb_registro_estado s
    WHERE s.revision_id = NEW.revision_id
      AND s.empresa_id = NEW.empresa_id
      AND s.status = 'READY_FOR_PIC_SIGNATURE'
  ) THEN RAISE(ABORT, 'EDB_PIC_SIGNATURE_STATE_INVALID') END;

  SELECT CASE WHEN NEW.tipo = 'OPERATOR_RECORD' AND NOT EXISTS (
    SELECT 1 FROM edb_registro_estado s
    WHERE s.revision_id = NEW.revision_id
      AND s.empresa_id = NEW.empresa_id
      AND s.status = 'PIC_SIGNED'
  ) THEN RAISE(ABORT, 'EDB_OPERATOR_SIGNATURE_STATE_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_signature_no_update
BEFORE UPDATE ON edb_assinaturas
BEGIN
  SELECT RAISE(ABORT, 'EDB_SIGNATURE_UPDATE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_signature_no_delete
BEFORE DELETE ON edb_assinaturas
BEGIN
  SELECT RAISE(ABORT, 'EDB_SIGNATURE_DELETE_FORBIDDEN');
END;
