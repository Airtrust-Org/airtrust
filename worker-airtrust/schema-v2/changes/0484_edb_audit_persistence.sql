-- 0484 — eDB diary-scoped tamper-evident audit persistence
--
-- Additive local persistence for the hash-linked audit chain already enforced
-- by worker-airtrust/src/services/edb/audit-chain.ts.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: merged current-main eDB audit-chain domain contract and 0483 local diary persistence.
--   operational_decision: persist append-only, diary-scoped audit evidence without adding ANAC transport, receipt, acceptance or unresolved flight semantics.
--   dry_run_required: validate Schema V2 hashes and disposable-local SQLite invariants before any governed remote apply.
--   rollback_plan_required: worker-airtrust/schema-v2/plans/edb-audit-persistence-0484.md (application rollback is sufficient while unused; physical removal requires a separately reviewed change).
--

CREATE TABLE IF NOT EXISTS edb_audit_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no >= 1),
  source_flight_id INTEGER,
  technical_situation_id TEXT,
  revision_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'RECORD_CREATED',
    'SOURCE_SNAPSHOT_CAPTURED',
    'REGULATORY_DATA_UPDATED',
    'PIC_TECHNICAL_ACK_SIGNED',
    'PIC_FLIGHT_RECORD_SIGNED',
    'OPERATOR_RECORD_SIGNED',
    'DISCREPANCY_RECORDED',
    'MAINTENANCE_ACTION_APPENDED',
    'RTS_APPROVAL_APPENDED',
    'RECORD_SUPERSEDED',
    'RECORD_CANCELLED'
  )),
  actor_json TEXT CHECK (actor_json IS NULL OR json_valid(actor_json)),
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  previous_event_hash_sha256 TEXT,
  event_hash_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    previous_event_hash_sha256 IS NULL
    OR (
      length(previous_event_hash_sha256) = 64
      AND previous_event_hash_sha256 NOT GLOB '*[^0-9a-f]*'
    )
  ),
  CHECK (
    length(event_hash_sha256) = 64
    AND event_hash_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  CHECK (
    event_type NOT IN ('SOURCE_SNAPSHOT_CAPTURED', 'PIC_TECHNICAL_ACK_SIGNED')
    OR (
      source_flight_id IS NOT NULL
      AND technical_situation_id IS NOT NULL
      AND length(trim(technical_situation_id)) > 0
      AND revision_id IS NULL
    )
  ),
  CHECK (
    event_type NOT IN (
      'RECORD_CREATED',
      'PIC_FLIGHT_RECORD_SIGNED',
      'OPERATOR_RECORD_SIGNED',
      'DISCREPANCY_RECORDED',
      'MAINTENANCE_ACTION_APPENDED',
      'RTS_APPROVAL_APPENDED',
      'RECORD_SUPERSEDED',
      'RECORD_CANCELLED'
    )
    OR (
      revision_id IS NOT NULL
      AND length(trim(revision_id)) > 0
    )
  ),
  CHECK (
    event_type <> 'REGULATORY_DATA_UPDATED'
    OR source_flight_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_audit_diary_sequence
  ON edb_audit_events (empresa_id, diario_id, sequence_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_audit_diary_hash
  ON edb_audit_events (empresa_id, diario_id, event_hash_sha256);

CREATE INDEX IF NOT EXISTS idx_edb_audit_diary_time
  ON edb_audit_events (empresa_id, diario_id, occurred_at, sequence_no);

CREATE TRIGGER IF NOT EXISTS trg_edb_audit_require_diary_scope
BEFORE INSERT ON edb_audit_events
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM edb_diarios d
     WHERE d.id = NEW.diario_id
       AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_AUDIT_DIARY_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_audit_chain_guard
BEFORE INSERT ON edb_audit_events
BEGIN
  SELECT CASE WHEN NEW.sequence_no = 1
    AND NEW.previous_event_hash_sha256 IS NOT NULL
    THEN RAISE(ABORT, 'EDB_AUDIT_FIRST_PREVIOUS_HASH_MUST_BE_NULL') END;

  SELECT CASE WHEN NEW.sequence_no = 1
    AND EXISTS (
      SELECT 1
        FROM edb_audit_events e
       WHERE e.empresa_id = NEW.empresa_id
         AND e.diario_id = NEW.diario_id
    )
    THEN RAISE(ABORT, 'EDB_AUDIT_SEQUENCE_CONFLICT') END;

  SELECT CASE WHEN NEW.sequence_no > 1
    AND NOT EXISTS (
      SELECT 1
        FROM edb_audit_events previous
       WHERE previous.empresa_id = NEW.empresa_id
         AND previous.diario_id = NEW.diario_id
         AND previous.sequence_no = NEW.sequence_no - 1
         AND previous.event_hash_sha256 = NEW.previous_event_hash_sha256
    )
    THEN RAISE(ABORT, 'EDB_AUDIT_PREVIOUS_HASH_MISMATCH') END;

  SELECT CASE WHEN NEW.sequence_no > 1
    AND EXISTS (
      SELECT 1
        FROM edb_audit_events previous
       WHERE previous.empresa_id = NEW.empresa_id
         AND previous.diario_id = NEW.diario_id
         AND previous.sequence_no = NEW.sequence_no - 1
         AND datetime(NEW.occurred_at) < datetime(previous.occurred_at)
    )
    THEN RAISE(ABORT, 'EDB_AUDIT_EVENT_TIME_REGRESSION') END;

  SELECT CASE WHEN NEW.sequence_no > 1
    AND EXISTS (
      SELECT 1
        FROM edb_audit_events later
       WHERE later.empresa_id = NEW.empresa_id
         AND later.diario_id = NEW.diario_id
         AND later.sequence_no >= NEW.sequence_no
    )
    THEN RAISE(ABORT, 'EDB_AUDIT_SEQUENCE_CONFLICT') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_audit_no_update
BEFORE UPDATE ON edb_audit_events
BEGIN
  SELECT RAISE(ABORT, 'EDB_AUDIT_UPDATE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_audit_no_delete
BEFORE DELETE ON edb_audit_events
BEGIN
  SELECT RAISE(ABORT, 'EDB_AUDIT_DELETE_FORBIDDEN');
END;
