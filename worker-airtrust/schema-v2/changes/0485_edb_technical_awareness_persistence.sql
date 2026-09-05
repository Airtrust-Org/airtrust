-- 0485 — eDB preflight technical-awareness persistence
--
-- Additive local persistence for immutable preflight technical-situation
-- snapshots and the PIC acknowledgement bound to the exact snapshot hash.
-- No ANAC transport, receipt, acceptance, cycle or IFR semantics are added.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: current-main technical-awareness domain contract + postflight finalization boundary + Controle de Voos tenant/flight schema.
--   operational_decision: persist only hashed preflight aircraft/maintenance evidence and one immutable PIC acknowledgement per snapshot.
--   dry_run_required: validate Schema V2 hashes and disposable-local SQLite invariants before any governed remote apply.
--   rollback_plan_required: worker-airtrust/schema-v2/plans/edb-technical-awareness-persistence-0485.md (application rollback is sufficient while unused; physical removal requires a separately reviewed change).
--

CREATE TABLE IF NOT EXISTS edb_situacoes_tecnicas (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  voo_id INTEGER NOT NULL,
  aeronave_id INTEGER,
  aircraft_json TEXT NOT NULL CHECK (json_valid(aircraft_json)),
  maintenance_json TEXT NOT NULL CHECK (json_valid(maintenance_json)),
  technical_content_sha256 TEXT NOT NULL,
  canonical_snapshot_sha256 TEXT NOT NULL,
  captured_at TEXT NOT NULL CHECK (datetime(captured_at) IS NOT NULL),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    length(technical_content_sha256) = 64
    AND technical_content_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (
    length(canonical_snapshot_sha256) = 64
    AND canonical_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE INDEX IF NOT EXISTS idx_edb_situacoes_tecnicas_flight
  ON edb_situacoes_tecnicas (empresa_id, voo_id, captured_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_situacoes_tecnicas_snapshot_hash
  ON edb_situacoes_tecnicas (empresa_id, voo_id, canonical_snapshot_sha256);

CREATE TABLE IF NOT EXISTS edb_ciencias_tecnicas_pic (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  situacao_tecnica_id TEXT NOT NULL,
  voo_id INTEGER NOT NULL,
  signer_funcionario_id INTEGER,
  signer_user_id INTEGER,
  signer_nome TEXT NOT NULL CHECK (length(trim(signer_nome)) > 0),
  signer_codigo_anac TEXT,
  signed_at TEXT NOT NULL CHECK (datetime(signed_at) IS NOT NULL),
  canonical_snapshot_sha256 TEXT NOT NULL,
  metodo TEXT NOT NULL CHECK (metodo IN (
    'ASYMMETRIC_DIGITAL_SIGNATURE',
    'ELECTRONIC_SIGNATURE_WITH_CERTIFICATE'
  )),
  proof_reference TEXT NOT NULL CHECK (length(trim(proof_reference)) > 0),
  auth_evidence_json TEXT
    CHECK (auth_evidence_json IS NULL OR json_valid(auth_evidence_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    length(canonical_snapshot_sha256) = 64
    AND canonical_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_ciencia_pic_one_per_snapshot
  ON edb_ciencias_tecnicas_pic (empresa_id, situacao_tecnica_id);

CREATE INDEX IF NOT EXISTS idx_edb_ciencia_pic_flight
  ON edb_ciencias_tecnicas_pic (empresa_id, voo_id, signed_at);

CREATE TRIGGER IF NOT EXISTS trg_edb_situacao_tecnica_require_flight_scope
BEFORE INSERT ON edb_situacoes_tecnicas
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM cv_voos v
     WHERE v.id = NEW.voo_id
       AND v.empresa_id = NEW.empresa_id
       AND v.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'EDB_TECHNICAL_SNAPSHOT_FLIGHT_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.aeronave_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM cv_voos v
     WHERE v.id = NEW.voo_id
       AND v.empresa_id = NEW.empresa_id
       AND v.deleted_at IS NULL
       AND v.aeronave_id = NEW.aeronave_id
  ) THEN RAISE(ABORT, 'EDB_TECHNICAL_SNAPSHOT_AIRCRAFT_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_situacao_tecnica_no_update
BEFORE UPDATE ON edb_situacoes_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_SNAPSHOT_UPDATE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_situacao_tecnica_no_delete
BEFORE DELETE ON edb_situacoes_tecnicas
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_SNAPSHOT_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_ciencia_pic_require_snapshot_binding
BEFORE INSERT ON edb_ciencias_tecnicas_pic
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM edb_situacoes_tecnicas s
     WHERE s.id = NEW.situacao_tecnica_id
       AND s.empresa_id = NEW.empresa_id
       AND s.voo_id = NEW.voo_id
       AND s.canonical_snapshot_sha256 = NEW.canonical_snapshot_sha256
  ) THEN RAISE(ABORT, 'EDB_TECHNICAL_ACK_SNAPSHOT_BINDING_MISMATCH') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
      FROM edb_situacoes_tecnicas s
     WHERE s.id = NEW.situacao_tecnica_id
       AND datetime(NEW.signed_at) < datetime(s.captured_at)
  ) THEN RAISE(ABORT, 'EDB_TECHNICAL_ACK_PREDATES_SNAPSHOT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_ciencia_pic_no_update
BEFORE UPDATE ON edb_ciencias_tecnicas_pic
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_ACK_UPDATE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_ciencia_pic_no_delete
BEFORE DELETE ON edb_ciencias_tecnicas_pic
BEGIN
  SELECT RAISE(ABORT, 'EDB_TECHNICAL_ACK_DELETE_FORBIDDEN');
END;
