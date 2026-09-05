-- 0483 — eDB local diary governance persistence foundation
--
-- Additive and inert. This migration creates local persistence only for diary
-- identity, volume boundary acts and information-loss/reconstitution evidence.
-- It does not promote ambiguous Controle de Voos fields into regulated eDB
-- semantics and does not create any ANAC transport/outbox/receipt contract.
--
-- OPERATIONAL MARKERS (guard:operational-sql-sources):
--   source_reference: Resolução ANAC 773/2025 + merged local domain contracts (#312, #314, #316; #317 in review).
--   operational_decision: persist only locally-defined diary/volume/integrity evidence while #91 and #93 remain fail-closed external/semantic dependencies.
--   dry_run_required: validate the exact Schema V2 bundle and disposable-local SQLite invariants before any governed remote apply.
--   rollback_plan_required: worker-airtrust/schema-v2/plans/edb-diary-persistence-0483.md (application rollback is sufficient; destructive table removal requires a separately reviewed change).
--

CREATE TABLE IF NOT EXISTS edb_diarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  aeronave_id INTEGER NOT NULL,
  contract_version TEXT NOT NULL DEFAULT 'edb.local.v1',
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_diarios_active_aircraft
  ON edb_diarios (empresa_id, aeronave_id)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_edb_diarios_tenant_status
  ON edb_diarios (empresa_id, status, id);

CREATE TABLE IF NOT EXISTS edb_volumes (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  numero_volume INTEGER NOT NULL CHECK (numero_volume >= 1),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  opened_at TEXT NOT NULL,
  opening_act_json TEXT NOT NULL CHECK (json_valid(opening_act_json)),
  closed_at TEXT,
  closing_act_json TEXT
    CHECK (closing_act_json IS NULL OR json_valid(closing_act_json)),
  retencao_minima_ate TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (status = 'OPEN' AND closed_at IS NULL AND closing_act_json IS NULL)
    OR
    (status = 'CLOSED' AND closed_at IS NOT NULL AND closing_act_json IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_volumes_sequence
  ON edb_volumes (empresa_id, diario_id, numero_volume);

CREATE UNIQUE INDEX IF NOT EXISTS idx_edb_volumes_single_open
  ON edb_volumes (empresa_id, diario_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_edb_volumes_tenant_diary
  ON edb_volumes (empresa_id, diario_id, status, numero_volume);

CREATE TABLE IF NOT EXISTS edb_incidentes_integridade (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  diario_id INTEGER NOT NULL,
  volume_id TEXT,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('LOSS', 'MISPLACEMENT', 'CORRUPTION')),
  detected_at TEXT NOT NULL,
  descricao TEXT NOT NULL,
  police_occurrence_reference TEXT,
  police_reported_at TEXT,
  anac_notification_reference TEXT,
  anac_notified_at TEXT,
  reconstitution_outcome TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (reconstitution_outcome IN ('PENDING', 'RECONSTITUTED', 'IMPOSSIBLE')),
  reconstitution_completed_at TEXT,
  new_diary_opening_observation TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (
    (police_occurrence_reference IS NULL AND police_reported_at IS NULL)
    OR
    (police_occurrence_reference IS NOT NULL AND police_reported_at IS NOT NULL)
  ),
  CHECK (
    (anac_notification_reference IS NULL AND anac_notified_at IS NULL)
    OR
    (anac_notification_reference IS NOT NULL AND anac_notified_at IS NOT NULL)
  ),
  CHECK (
    (reconstitution_outcome = 'PENDING'
      AND reconstitution_completed_at IS NULL
      AND new_diary_opening_observation IS NULL)
    OR
    (reconstitution_outcome = 'RECONSTITUTED'
      AND reconstitution_completed_at IS NOT NULL
      AND new_diary_opening_observation IS NULL)
    OR
    (reconstitution_outcome = 'IMPOSSIBLE'
      AND reconstitution_completed_at IS NOT NULL
      AND new_diary_opening_observation IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_edb_incidentes_tenant_diary
  ON edb_incidentes_integridade (empresa_id, diario_id, detected_at);

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_require_aircraft_scope
BEFORE INSERT ON edb_diarios
BEGIN
  SELECT CASE WHEN NEW.status <> 'ACTIVE'
    THEN RAISE(ABORT, 'EDB_DIARY_MUST_START_ACTIVE') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM aeronaves a
     WHERE a.id = NEW.aeronave_id
       AND a.empresa_id = NEW.empresa_id
       AND a.deleted_at IS NULL
  ) THEN RAISE(ABORT, 'EDB_DIARY_AIRCRAFT_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_identity_immutable
BEFORE UPDATE OF empresa_id, aeronave_id, contract_version ON edb_diarios
WHEN NEW.empresa_id <> OLD.empresa_id
  OR NEW.aeronave_id <> OLD.aeronave_id
  OR NEW.contract_version <> OLD.contract_version
BEGIN
  SELECT RAISE(ABORT, 'EDB_DIARY_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_status_transition
BEFORE UPDATE OF status ON edb_diarios
WHEN NEW.status <> OLD.status
BEGIN
  SELECT CASE WHEN NOT (OLD.status = 'ACTIVE' AND NEW.status = 'CLOSED')
    THEN RAISE(ABORT, 'EDB_DIARY_STATUS_TRANSITION_NOT_ALLOWED') END;
  SELECT CASE WHEN NEW.status = 'CLOSED' AND EXISTS (
    SELECT 1
      FROM edb_volumes v
     WHERE v.empresa_id = OLD.empresa_id
       AND v.diario_id = OLD.id
       AND v.status = 'OPEN'
  ) THEN RAISE(ABORT, 'EDB_DIARY_OPEN_VOLUME_EXISTS') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_no_delete
BEFORE DELETE ON edb_diarios
BEGIN
  SELECT RAISE(ABORT, 'EDB_DIARY_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_require_diary_scope
BEFORE INSERT ON edb_volumes
BEGIN
  SELECT CASE WHEN NEW.status <> 'OPEN'
    THEN RAISE(ABORT, 'EDB_VOLUME_MUST_START_OPEN') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM edb_diarios d
     WHERE d.id = NEW.diario_id
       AND d.empresa_id = NEW.empresa_id
       AND d.status = 'ACTIVE'
  ) THEN RAISE(ABORT, 'EDB_VOLUME_DIARY_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_identity_immutable
BEFORE UPDATE OF empresa_id, diario_id, numero_volume, opened_at, opening_act_json
ON edb_volumes
WHEN NEW.empresa_id <> OLD.empresa_id
  OR NEW.diario_id <> OLD.diario_id
  OR NEW.numero_volume <> OLD.numero_volume
  OR NEW.opened_at <> OLD.opened_at
  OR NEW.opening_act_json <> OLD.opening_act_json
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_status_transition
BEFORE UPDATE OF status ON edb_volumes
WHEN NEW.status <> OLD.status
BEGIN
  SELECT CASE WHEN NOT (OLD.status = 'OPEN' AND NEW.status = 'CLOSED')
    THEN RAISE(ABORT, 'EDB_VOLUME_STATUS_TRANSITION_NOT_ALLOWED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_closed_evidence_immutable
BEFORE UPDATE OF closed_at, closing_act_json, retencao_minima_ate ON edb_volumes
WHEN OLD.status = 'CLOSED'
 AND (
   COALESCE(NEW.closed_at, '') <> COALESCE(OLD.closed_at, '')
   OR COALESCE(NEW.closing_act_json, '') <> COALESCE(OLD.closing_act_json, '')
   OR COALESCE(NEW.retencao_minima_ate, '') <> COALESCE(OLD.retencao_minima_ate, '')
 )
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_CLOSED_EVIDENCE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_no_delete
BEFORE DELETE ON edb_volumes
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incident_require_scope
BEFORE INSERT ON edb_incidentes_integridade
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM edb_diarios d
     WHERE d.id = NEW.diario_id
       AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_INCIDENT_DIARY_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.volume_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM edb_volumes v
     WHERE v.id = NEW.volume_id
       AND v.empresa_id = NEW.empresa_id
       AND v.diario_id = NEW.diario_id
  ) THEN RAISE(ABORT, 'EDB_INCIDENT_VOLUME_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incident_initial_evidence_guard
BEFORE INSERT ON edb_incidentes_integridade
BEGIN
  SELECT CASE WHEN NEW.police_reported_at IS NOT NULL
    AND datetime(NEW.police_reported_at) < datetime(NEW.detected_at)
    THEN RAISE(ABORT, 'EDB_INCIDENT_POLICE_BEFORE_DETECTION') END;

  SELECT CASE WHEN NEW.anac_notification_reference IS NOT NULL
    AND NEW.police_occurrence_reference IS NULL
    THEN RAISE(ABORT, 'EDB_INCIDENT_ANAC_NOTIFICATION_REQUIRES_POLICE') END;

  SELECT CASE WHEN NEW.anac_notified_at IS NOT NULL
    AND (
      NEW.police_reported_at IS NULL
      OR datetime(NEW.anac_notified_at) < datetime(NEW.police_reported_at)
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_ANAC_NOTIFICATION_CHRONOLOGY_INVALID') END;

  SELECT CASE WHEN NEW.reconstitution_outcome <> 'PENDING'
    THEN RAISE(ABORT, 'EDB_INCIDENT_MUST_START_PENDING') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incident_identity_immutable
BEFORE UPDATE OF empresa_id, diario_id, volume_id, tipo, detected_at, descricao
ON edb_incidentes_integridade
WHEN NEW.empresa_id <> OLD.empresa_id
  OR NEW.diario_id <> OLD.diario_id
  OR COALESCE(NEW.volume_id, '') <> COALESCE(OLD.volume_id, '')
  OR NEW.tipo <> OLD.tipo
  OR NEW.detected_at <> OLD.detected_at
  OR NEW.descricao <> OLD.descricao
BEGIN
  SELECT RAISE(ABORT, 'EDB_INCIDENT_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incident_progress_guard
BEFORE UPDATE ON edb_incidentes_integridade
BEGIN
  SELECT CASE WHEN OLD.police_occurrence_reference IS NOT NULL
    AND (
      COALESCE(NEW.police_occurrence_reference, '') <> OLD.police_occurrence_reference
      OR COALESCE(NEW.police_reported_at, '') <> OLD.police_reported_at
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_POLICE_EVIDENCE_IMMUTABLE') END;

  SELECT CASE WHEN OLD.anac_notification_reference IS NOT NULL
    AND (
      COALESCE(NEW.anac_notification_reference, '') <> OLD.anac_notification_reference
      OR COALESCE(NEW.anac_notified_at, '') <> OLD.anac_notified_at
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_ANAC_NOTIFICATION_EVIDENCE_IMMUTABLE') END;

  SELECT CASE WHEN NEW.police_reported_at IS NOT NULL
    AND datetime(NEW.police_reported_at) < datetime(OLD.detected_at)
    THEN RAISE(ABORT, 'EDB_INCIDENT_POLICE_BEFORE_DETECTION') END;

  SELECT CASE WHEN NEW.anac_notification_reference IS NOT NULL
    AND NEW.police_occurrence_reference IS NULL
    THEN RAISE(ABORT, 'EDB_INCIDENT_ANAC_NOTIFICATION_REQUIRES_POLICE') END;

  SELECT CASE WHEN NEW.anac_notified_at IS NOT NULL
    AND (
      NEW.police_reported_at IS NULL
      OR datetime(NEW.anac_notified_at) < datetime(NEW.police_reported_at)
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_ANAC_NOTIFICATION_CHRONOLOGY_INVALID') END;

  SELECT CASE WHEN OLD.reconstitution_outcome <> 'PENDING'
    AND (
      NEW.reconstitution_outcome <> OLD.reconstitution_outcome
      OR COALESCE(NEW.reconstitution_completed_at, '') <> COALESCE(OLD.reconstitution_completed_at, '')
      OR COALESCE(NEW.new_diary_opening_observation, '') <> COALESCE(OLD.new_diary_opening_observation, '')
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_RECONSTITUTION_EVIDENCE_IMMUTABLE') END;

  SELECT CASE WHEN NEW.reconstitution_completed_at IS NOT NULL
    AND datetime(NEW.reconstitution_completed_at) < datetime(OLD.detected_at)
    THEN RAISE(ABORT, 'EDB_INCIDENT_RECONSTITUTION_BEFORE_DETECTION') END;

  SELECT CASE WHEN NEW.reconstitution_outcome = 'IMPOSSIBLE'
    AND (
      NEW.police_occurrence_reference IS NULL
      OR instr(NEW.new_diary_opening_observation, NEW.police_occurrence_reference) = 0
    )
    THEN RAISE(ABORT, 'EDB_INCIDENT_IMPOSSIBLE_RECONSTITUTION_REFERENCE_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incident_no_delete
BEFORE DELETE ON edb_incidentes_integridade
BEGIN
  SELECT RAISE(ABORT, 'EDB_INCIDENT_DELETE_FORBIDDEN');
END;
