-- AirTrust Regulated Records Core - experimental local physical schema.
-- Scope: local-only experiment for the ADR-approved minimum core.
-- No eDB, SDRMe, Controle de Voos, signatures, exports, devices, sync, or retention policies.
-- Experimental local artifact only; do not apply to staging or production.
-- Do not move this file to worker-airtrust/migrations/.
-- This file is not 0411 and must not be treated as a regular migration.
-- This file does not authorize regulated use.

CREATE TABLE IF NOT EXISTS regulated_records (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  module TEXT NOT NULL,
  record_type TEXT NOT NULL,
  source_module TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  regulatory_scope_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  current_version_id TEXT,
  canonical_schema_version TEXT NOT NULL,
  aircraft_id TEXT,
  aircraft_prefix TEXT,
  person_id TEXT,
  period_start TEXT,
  period_end TEXT,
  created_by INTEGER NOT NULL,
  sealed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sealed_at TEXT,
  deleted_at TEXT,
  CHECK (status IN ('DRAFT', 'SEALED', 'SUPERSEDED', 'VOIDED_BY_ADDENDUM')),
  CHECK (status != 'SEALED' OR deleted_at IS NULL),
  UNIQUE (empresa_id, source_module, source_entity_type, source_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_regulated_records_empresa_type_status_created
  ON regulated_records (empresa_id, record_type, status, created_at);

CREATE INDEX IF NOT EXISTS idx_regulated_records_empresa_source
  ON regulated_records (empresa_id, source_module, source_entity_type, source_entity_id);

CREATE INDEX IF NOT EXISTS idx_regulated_records_empresa_aircraft_period
  ON regulated_records (empresa_id, aircraft_prefix, period_start);

CREATE INDEX IF NOT EXISTS idx_regulated_records_empresa_person_period
  ON regulated_records (empresa_id, person_id, period_start);

CREATE INDEX IF NOT EXISTS idx_regulated_records_empresa_sealed
  ON regulated_records (empresa_id, sealed_at);

CREATE TABLE IF NOT EXISTS regulated_record_versions (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  version_reason TEXT NOT NULL,
  base_version_id TEXT,
  canonical_payload_json TEXT NOT NULL,
  canonical_payload_size INTEGER NOT NULL,
  canonical_schema_version TEXT NOT NULL,
  canonicalization_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sealed_at TEXT,
  deleted_at TEXT,
  CHECK (version_number > 0),
  CHECK (canonical_payload_size > 0),
  CHECK (status IN ('DRAFT', 'SEALED')),
  CHECK (status != 'SEALED' OR deleted_at IS NULL),
  UNIQUE (record_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_regulated_versions_empresa_record_version
  ON regulated_record_versions (empresa_id, record_id, version_number);

CREATE INDEX IF NOT EXISTS idx_regulated_versions_empresa_schema_created
  ON regulated_record_versions (empresa_id, canonical_schema_version, created_at);

CREATE INDEX IF NOT EXISTS idx_regulated_versions_empresa_status_created
  ON regulated_record_versions (empresa_id, status, created_at);

CREATE TABLE IF NOT EXISTS regulated_record_hashes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  canonicalization_version TEXT NOT NULL,
  canonical_schema_version TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  attachments_manifest_hash TEXT,
  record_hash TEXT NOT NULL,
  previous_record_hash TEXT,
  previous_tenant_chain_hash TEXT,
  tenant_chain_hash TEXT NOT NULL,
  chain_scope TEXT NOT NULL,
  chain_sequence INTEGER NOT NULL,
  computed_by INTEGER NOT NULL,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (hash_algorithm IN ('SHA-256')),
  CHECK (length(payload_hash) = 64),
  CHECK (attachments_manifest_hash IS NULL OR length(attachments_manifest_hash) = 64),
  CHECK (length(record_hash) = 64),
  CHECK (previous_record_hash IS NULL OR length(previous_record_hash) = 64),
  CHECK (previous_tenant_chain_hash IS NULL OR length(previous_tenant_chain_hash) = 64),
  CHECK (length(tenant_chain_hash) = 64),
  CHECK (chain_sequence > 0),
  UNIQUE (version_id, hash_algorithm, canonicalization_version),
  UNIQUE (empresa_id, chain_scope, chain_sequence),
  UNIQUE (empresa_id, chain_scope, tenant_chain_hash)
);

CREATE INDEX IF NOT EXISTS idx_regulated_hashes_empresa_record_computed
  ON regulated_record_hashes (empresa_id, record_id, computed_at);

CREATE INDEX IF NOT EXISTS idx_regulated_hashes_empresa_chain_sequence
  ON regulated_record_hashes (empresa_id, chain_scope, chain_sequence);

CREATE INDEX IF NOT EXISTS idx_regulated_hashes_empresa_type_computed
  ON regulated_record_hashes (empresa_id, record_type, computed_at);

CREATE INDEX IF NOT EXISTS idx_regulated_hashes_payload
  ON regulated_record_hashes (payload_hash);

CREATE INDEX IF NOT EXISTS idx_regulated_hashes_record_hash
  ON regulated_record_hashes (record_hash);

CREATE TABLE IF NOT EXISTS regulated_audit_events (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  record_id TEXT,
  version_id TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_funcionario_id INTEGER,
  actor_type TEXT NOT NULL,
  actor_role TEXT,
  support_mode INTEGER NOT NULL DEFAULT 0,
  request_id TEXT,
  idempotency_key TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  device_id TEXT,
  event_payload_json TEXT NOT NULL,
  previous_event_hash TEXT,
  event_hash TEXT NOT NULL,
  tenant_chain_hash TEXT NOT NULL,
  chain_scope TEXT NOT NULL,
  chain_sequence INTEGER NOT NULL,
  canonical_schema_version TEXT,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  CHECK (hash_algorithm IN ('SHA-256')),
  CHECK (deleted_at IS NULL),
  CHECK (previous_event_hash IS NULL OR length(previous_event_hash) = 64),
  CHECK (length(event_hash) = 64),
  CHECK (length(tenant_chain_hash) = 64),
  CHECK (chain_sequence > 0),
  UNIQUE (empresa_id, chain_scope, chain_sequence),
  UNIQUE (empresa_id, chain_scope, event_hash),
  UNIQUE (empresa_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_regulated_audit_empresa_record_created
  ON regulated_audit_events (empresa_id, record_id, created_at);

CREATE INDEX IF NOT EXISTS idx_regulated_audit_empresa_type_created
  ON regulated_audit_events (empresa_id, event_type, created_at);

CREATE INDEX IF NOT EXISTS idx_regulated_audit_empresa_actor_created
  ON regulated_audit_events (empresa_id, actor_user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_regulated_audit_empresa_chain_sequence
  ON regulated_audit_events (empresa_id, chain_scope, chain_sequence);

CREATE INDEX IF NOT EXISTS idx_regulated_audit_request
  ON regulated_audit_events (request_id);

CREATE TABLE IF NOT EXISTS regulated_chain_heads (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  chain_scope TEXT NOT NULL,
  last_chain_sequence INTEGER NOT NULL DEFAULT 0,
  last_event_hash TEXT,
  last_tenant_chain_hash TEXT,
  updated_by INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (last_chain_sequence >= 0),
  CHECK (last_event_hash IS NULL OR length(last_event_hash) = 64),
  CHECK (last_tenant_chain_hash IS NULL OR length(last_tenant_chain_hash) = 64),
  CHECK (
    (
      last_chain_sequence = 0
      AND last_event_hash IS NULL
      AND last_tenant_chain_hash IS NULL
    )
    OR (
      last_chain_sequence > 0
      AND last_event_hash IS NOT NULL
      AND last_tenant_chain_hash IS NOT NULL
    )
  ),
  UNIQUE (empresa_id, chain_scope)
);

CREATE INDEX IF NOT EXISTS idx_regulated_chain_heads_empresa_scope
  ON regulated_chain_heads (empresa_id, chain_scope);

CREATE TABLE IF NOT EXISTS regulated_record_links (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  tenant_id TEXT,
  source_record_id TEXT NOT NULL,
  target_record_id TEXT NOT NULL,
  source_version_id TEXT,
  target_version_id TEXT,
  link_type TEXT NOT NULL,
  link_reason TEXT NOT NULL,
  link_status TEXT NOT NULL DEFAULT 'ACTIVE',
  canonical_schema_version TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT,
  CHECK (link_status IN ('ACTIVE', 'VOIDED_BY_ADDENDUM')),
  CHECK (link_status != 'ACTIVE' OR deleted_at IS NULL),
  UNIQUE (source_record_id, target_record_id, link_type)
);

CREATE INDEX IF NOT EXISTS idx_regulated_links_empresa_source_type
  ON regulated_record_links (empresa_id, source_record_id, link_type);

CREATE INDEX IF NOT EXISTS idx_regulated_links_empresa_target_type
  ON regulated_record_links (empresa_id, target_record_id, link_type);

CREATE INDEX IF NOT EXISTS idx_regulated_links_empresa_type_created
  ON regulated_record_links (empresa_id, link_type, created_at);

CREATE TRIGGER IF NOT EXISTS trg_regulated_records_no_update_after_seal
BEFORE UPDATE ON regulated_records
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'regulated_records: sealed records are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_records_no_delete_after_seal
BEFORE DELETE ON regulated_records
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'regulated_records: sealed records cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_records_no_soft_delete_when_sealed
BEFORE UPDATE OF deleted_at, status ON regulated_records
WHEN NEW.status = 'SEALED' AND NEW.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'regulated_records: sealed records cannot be soft-deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_records_current_version_same_empresa_insert
BEFORE INSERT ON regulated_records
WHEN
  NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM regulated_record_versions
    WHERE id = NEW.current_version_id
      AND record_id = NEW.id
      AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_records: current_version_id must belong to the same record and empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_records_current_version_same_empresa_update
BEFORE UPDATE OF empresa_id, current_version_id ON regulated_records
WHEN
  NEW.current_version_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM regulated_record_versions
    WHERE id = NEW.current_version_id
      AND record_id = NEW.id
      AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_records: current_version_id must belong to the same record and empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_versions_no_update_after_seal
BEFORE UPDATE ON regulated_record_versions
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_versions: sealed versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_versions_no_delete_after_seal
BEFORE DELETE ON regulated_record_versions
WHEN OLD.status = 'SEALED'
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_versions: sealed versions cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_versions_no_soft_delete_when_sealed
BEFORE UPDATE OF deleted_at, status ON regulated_record_versions
WHEN NEW.status = 'SEALED' AND NEW.deleted_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_versions: sealed versions cannot be soft-deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_versions_same_empresa_insert
BEFORE INSERT ON regulated_record_versions
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
  )
  OR (
    NEW.base_version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.base_version_id
        AND record_id = NEW.record_id
        AND empresa_id = NEW.empresa_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_versions: record_id and base_version_id must belong to version empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_versions_same_empresa_update
BEFORE UPDATE OF empresa_id, record_id, base_version_id ON regulated_record_versions
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
  )
  OR (
    NEW.base_version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.base_version_id
        AND record_id = NEW.record_id
        AND empresa_id = NEW.empresa_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_versions: record_id and base_version_id must belong to version empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_hashes_same_empresa_insert
BEFORE INSERT ON regulated_record_hashes
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM regulated_record_versions
    WHERE id = NEW.version_id
      AND record_id = NEW.record_id
      AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_hashes: record_id and version_id must belong to hash empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_hashes_same_empresa_update
BEFORE UPDATE OF empresa_id, record_id, version_id ON regulated_record_hashes
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM regulated_record_versions
    WHERE id = NEW.version_id
      AND record_id = NEW.record_id
      AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_hashes: record_id and version_id must belong to hash empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_hashes_no_update
BEFORE UPDATE ON regulated_record_hashes
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_hashes: hash rows are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_hashes_no_delete
BEFORE DELETE ON regulated_record_hashes
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_hashes: hash rows cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_audit_no_update
BEFORE UPDATE ON regulated_audit_events
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events: ledger rows are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_audit_no_delete
BEFORE DELETE ON regulated_audit_events
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events: ledger rows cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_audit_refs_same_empresa_insert
BEFORE INSERT ON regulated_audit_events
WHEN
  (
    NEW.record_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_records
      WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
    )
  )
  OR (
    NEW.version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.version_id AND empresa_id = NEW.empresa_id
    )
  )
  OR (
    NEW.record_id IS NOT NULL
    AND NEW.version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.version_id
        AND record_id = NEW.record_id
        AND empresa_id = NEW.empresa_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events: record_id and version_id must belong to event empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_audit_refs_same_empresa_update
BEFORE UPDATE OF empresa_id, record_id, version_id ON regulated_audit_events
WHEN
  (
    NEW.record_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_records
      WHERE id = NEW.record_id AND empresa_id = NEW.empresa_id
    )
  )
  OR (
    NEW.version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.version_id AND empresa_id = NEW.empresa_id
    )
  )
  OR (
    NEW.record_id IS NOT NULL
    AND NEW.version_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM regulated_record_versions
      WHERE id = NEW.version_id
        AND record_id = NEW.record_id
        AND empresa_id = NEW.empresa_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_audit_events: record_id and version_id must belong to event empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_chain_heads_matches_audit_insert
BEFORE INSERT ON regulated_chain_heads
WHEN
  NEW.last_chain_sequence > 0
  AND NOT EXISTS (
    SELECT 1 FROM regulated_audit_events
    WHERE empresa_id = NEW.empresa_id
      AND chain_scope = NEW.chain_scope
      AND chain_sequence = NEW.last_chain_sequence
      AND event_hash = NEW.last_event_hash
      AND tenant_chain_hash = NEW.last_tenant_chain_hash
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_chain_heads: head must match an existing audit event');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_chain_heads_no_rewind
BEFORE UPDATE OF empresa_id, chain_scope, last_chain_sequence, last_event_hash, last_tenant_chain_hash ON regulated_chain_heads
WHEN
  NEW.empresa_id != OLD.empresa_id
  OR NEW.chain_scope != OLD.chain_scope
  OR NEW.last_chain_sequence <= OLD.last_chain_sequence
BEGIN
  SELECT RAISE(ABORT, 'regulated_chain_heads: chain head can only advance within the same empresa_id and chain_scope');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_chain_heads_matches_audit_update
BEFORE UPDATE OF last_chain_sequence, last_event_hash, last_tenant_chain_hash ON regulated_chain_heads
WHEN
  NEW.last_chain_sequence > 0
  AND NOT EXISTS (
    SELECT 1 FROM regulated_audit_events
    WHERE empresa_id = NEW.empresa_id
      AND chain_scope = NEW.chain_scope
      AND chain_sequence = NEW.last_chain_sequence
      AND event_hash = NEW.last_event_hash
      AND tenant_chain_hash = NEW.last_tenant_chain_hash
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_chain_heads: head must match an existing audit event');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_chain_heads_no_delete
BEFORE DELETE ON regulated_chain_heads
BEGIN
  SELECT RAISE(ABORT, 'regulated_chain_heads: chain heads cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_links_same_empresa_insert
BEFORE INSERT ON regulated_record_links
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.source_record_id AND empresa_id = NEW.empresa_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.target_record_id AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_links: source and target records must belong to link empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_links_same_empresa_update
BEFORE UPDATE OF empresa_id, source_record_id, target_record_id ON regulated_record_links
WHEN
  NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.source_record_id AND empresa_id = NEW.empresa_id
  )
  OR NOT EXISTS (
    SELECT 1 FROM regulated_records
    WHERE id = NEW.target_record_id AND empresa_id = NEW.empresa_id
  )
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_links: source and target records must belong to link empresa_id');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_links_no_update_active
BEFORE UPDATE ON regulated_record_links
WHEN OLD.link_status = 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_links: active links are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_regulated_links_no_delete_active
BEFORE DELETE ON regulated_record_links
WHEN OLD.link_status = 'ACTIVE'
BEGIN
  SELECT RAISE(ABORT, 'regulated_record_links: active links cannot be deleted');
END;
