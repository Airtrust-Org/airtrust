-- 0480 — eDB diary/volume/incident lifecycle integrity
--
-- Additive fail-closed lifecycle protection for the disabled eDB foundation.
-- No production/staging apply is performed by PR #110.

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_identity_immutable
BEFORE UPDATE ON edb_diarios
WHEN
  NEW.id <> OLD.id OR
  NEW.empresa_id <> OLD.empresa_id OR
  NEW.aeronave_id <> OLD.aeronave_id OR
  NEW.contract_version <> OLD.contract_version OR
  NEW.regulamento_operador <> OLD.regulamento_operador OR
  COALESCE(NEW.created_by, -1) <> COALESCE(OLD.created_by, -1) OR
  NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'EDB_DIARY_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_status_transition_guard
BEFORE UPDATE OF status ON edb_diarios
WHEN NEW.status <> OLD.status
BEGIN
  SELECT CASE WHEN NOT (OLD.status = 'ATIVO' AND NEW.status = 'ENCERRADO')
    THEN RAISE(ABORT, 'EDB_DIARY_STATUS_TRANSITION_NOT_ALLOWED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_diario_no_delete
BEFORE DELETE ON edb_diarios
BEGIN
  SELECT RAISE(ABORT, 'EDB_DIARY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_status_transition_guard
BEFORE UPDATE OF status ON edb_volumes
WHEN NEW.status <> OLD.status
BEGIN
  SELECT CASE WHEN NOT (OLD.status = 'ABERTO' AND NEW.status = 'ENCERRADO')
    THEN RAISE(ABORT, 'EDB_VOLUME_STATUS_TRANSITION_NOT_ALLOWED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_closure_shape_guard
BEFORE UPDATE ON edb_volumes
BEGIN
  SELECT CASE WHEN NEW.status = 'ABERTO' AND (
    NEW.encerrado_em IS NOT NULL OR
    NEW.encerrado_por IS NOT NULL OR
    NEW.ato_encerramento_json IS NOT NULL
  ) THEN RAISE(ABORT, 'EDB_OPEN_VOLUME_CLOSING_EVIDENCE_NOT_ALLOWED') END;

  SELECT CASE WHEN NEW.status = 'ENCERRADO' AND (
    NEW.encerrado_em IS NULL OR
    NEW.encerrado_por IS NULL OR
    NEW.ato_encerramento_json IS NULL OR
    datetime(NEW.encerrado_em) IS NULL OR
    datetime(NEW.encerrado_em) < datetime(NEW.aberto_em)
  ) THEN RAISE(ABORT, 'EDB_CLOSED_VOLUME_CLOSING_EVIDENCE_INVALID') END;

  SELECT CASE WHEN NEW.ato_encerramento_json IS NOT NULL
    AND json_valid(NEW.ato_encerramento_json) <> 1
    THEN RAISE(ABORT, 'EDB_VOLUME_CLOSING_ACT_JSON_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_closed_evidence_immutable
BEFORE UPDATE ON edb_volumes
WHEN OLD.status = 'ENCERRADO' AND (
  NEW.status <> OLD.status OR
  COALESCE(NEW.encerrado_em, '') <> COALESCE(OLD.encerrado_em, '') OR
  COALESCE(NEW.encerrado_por, -1) <> COALESCE(OLD.encerrado_por, -1) OR
  COALESCE(NEW.ato_encerramento_json, '') <> COALESCE(OLD.ato_encerramento_json, '')
)
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_CLOSING_EVIDENCE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_no_delete
BEFORE DELETE ON edb_volumes
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incidente_progress_guard
BEFORE UPDATE ON edb_incidentes_integridade
BEGIN
  SELECT CASE WHEN OLD.police_report_reference IS NOT NULL AND
    COALESCE(NEW.police_report_reference, '') <> OLD.police_report_reference
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_POLICE_REFERENCE_IMMUTABLE') END;

  SELECT CASE WHEN OLD.anac_notification_reference IS NOT NULL AND
    COALESCE(NEW.anac_notification_reference, '') <> OLD.anac_notification_reference
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_ANAC_REFERENCE_IMMUTABLE') END;

  SELECT CASE WHEN NEW.police_report_reference IS NOT NULL AND
    trim(NEW.police_report_reference) = ''
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_POLICE_REFERENCE_INVALID') END;

  SELECT CASE WHEN NEW.anac_notification_reference IS NOT NULL AND
    trim(NEW.anac_notification_reference) = ''
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_ANAC_REFERENCE_INVALID') END;

  SELECT CASE WHEN NEW.anac_notification_reference IS NOT NULL AND
    NEW.police_report_reference IS NULL
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_ANAC_REQUIRES_POLICE_REFERENCE') END;

  SELECT CASE WHEN NEW.reconstitution_evidence_json IS NOT NULL AND
    json_valid(NEW.reconstitution_evidence_json) <> 1
    THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_EVIDENCE_JSON_INVALID') END;

  SELECT CASE WHEN NEW.police_report_reference IS NOT NULL AND (
    NEW.reconstitution_evidence_json IS NULL OR
    json_type(NEW.reconstitution_evidence_json, '$.policeReportedAt') <> 'text' OR
    datetime(json_extract(NEW.reconstitution_evidence_json, '$.policeReportedAt')) IS NULL
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_POLICE_TIMESTAMP_REQUIRED') END;

  SELECT CASE WHEN NEW.anac_notification_reference IS NOT NULL AND (
    NEW.reconstitution_evidence_json IS NULL OR
    json_type(NEW.reconstitution_evidence_json, '$.anacNotifiedAt') <> 'text' OR
    datetime(json_extract(NEW.reconstitution_evidence_json, '$.anacNotifiedAt')) IS NULL
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_ANAC_TIMESTAMP_REQUIRED') END;

  SELECT CASE WHEN NEW.status = 'RECONSTITUTED' AND (
    NEW.reconstitution_evidence_json IS NULL OR
    json_type(NEW.reconstitution_evidence_json, '$.reconstitutionCompletedAt') <> 'text' OR
    datetime(json_extract(NEW.reconstitution_evidence_json, '$.reconstitutionCompletedAt')) IS NULL
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_RECONSTITUTION_EVIDENCE_REQUIRED') END;

  SELECT CASE WHEN NEW.status = 'IMPOSSIBLE_TO_RECONSTITUTE' AND (
    NEW.reconstitution_evidence_json IS NULL OR
    json_type(NEW.reconstitution_evidence_json, '$.reconstitutionCompletedAt') <> 'text' OR
    datetime(json_extract(NEW.reconstitution_evidence_json, '$.reconstitutionCompletedAt')) IS NULL OR
    json_type(NEW.reconstitution_evidence_json, '$.newDiaryOpeningObservation') <> 'text' OR
    trim(json_extract(NEW.reconstitution_evidence_json, '$.newDiaryOpeningObservation')) = ''
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_IMPOSSIBLE_EVIDENCE_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incidente_status_transition_guard
BEFORE UPDATE OF status ON edb_incidentes_integridade
WHEN NEW.status <> OLD.status
BEGIN
  SELECT CASE WHEN NOT (
    OLD.status = 'OPEN' AND
    NEW.status IN ('RECONSTITUTED', 'IMPOSSIBLE_TO_RECONSTITUTE')
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_STATUS_TRANSITION_NOT_ALLOWED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incidente_no_delete
BEFORE DELETE ON edb_incidentes_integridade
BEGIN
  SELECT RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_IMMUTABLE');
END;
