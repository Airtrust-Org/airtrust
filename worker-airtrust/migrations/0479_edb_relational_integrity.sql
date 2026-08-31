-- 0479 — eDB diary, discrepancy and audit relational integrity
--
-- Additive hardening for the disabled eDB foundation. Materializes audit scope
-- needed for preflight traceability and protects cross-tenant/history bindings.

ALTER TABLE edb_auditoria_eventos ADD COLUMN voo_id INTEGER;
ALTER TABLE edb_auditoria_eventos ADD COLUMN situacao_tecnica_id TEXT;
ALTER TABLE edb_auditoria_eventos ADD COLUMN actor_json TEXT;

CREATE INDEX IF NOT EXISTS idx_edb_auditoria_voo
  ON edb_auditoria_eventos (empresa_id, voo_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_edb_auditoria_situacao_tecnica
  ON edb_auditoria_eventos (empresa_id, situacao_tecnica_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_require_diary_scope
BEFORE INSERT ON edb_volumes
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_diarios d
    WHERE d.id = NEW.diario_id
      AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_VOLUME_DIARY_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_volume_identity_immutable
BEFORE UPDATE ON edb_volumes
WHEN
  NEW.id <> OLD.id OR
  NEW.empresa_id <> OLD.empresa_id OR
  NEW.diario_id <> OLD.diario_id OR
  NEW.numero_volume <> OLD.numero_volume OR
  NEW.aberto_em <> OLD.aberto_em OR
  NEW.aberto_por <> OLD.aberto_por OR
  NEW.ato_abertura_json <> OLD.ato_abertura_json
BEGIN
  SELECT RAISE(ABORT, 'EDB_VOLUME_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_discrepancia_require_revision_scope
BEFORE INSERT ON edb_discrepancias_tecnicas
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_registro_revisoes r
    WHERE r.id = NEW.revision_id
      AND r.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_DISCREPANCY_REVISION_SCOPE_MISMATCH') END;

  SELECT CASE WHEN datetime(NEW.detectado_em) IS NULL
    THEN RAISE(ABORT, 'EDB_DISCREPANCY_TIMESTAMP_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_acao_manutencao_require_discrepancy_scope
BEFORE INSERT ON edb_acoes_manutencao
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_discrepancias_tecnicas d
    WHERE d.id = NEW.discrepancia_id
      AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_MAINTENANCE_ACTION_DISCREPANCY_SCOPE_MISMATCH') END;

  SELECT CASE WHEN datetime(NEW.executado_em) IS NULL
    THEN RAISE(ABORT, 'EDB_MAINTENANCE_ACTION_TIMESTAMP_INVALID') END;

  SELECT CASE WHEN NEW.tipo = 'RTS_APPROVAL'
    AND (NEW.referencia_acao_id IS NULL OR trim(NEW.referencia_acao_id) = '')
    THEN RAISE(ABORT, 'EDB_RTS_CORRECTIVE_ACTION_REFERENCE_REQUIRED') END;

  SELECT CASE WHEN NEW.tipo = 'RTS_APPROVAL' AND NOT EXISTS (
    SELECT 1
    FROM edb_acoes_manutencao corrective
    WHERE corrective.id = NEW.referencia_acao_id
      AND corrective.empresa_id = NEW.empresa_id
      AND corrective.discrepancia_id = NEW.discrepancia_id
      AND corrective.tipo = 'CORRECTIVE_ACTION'
      AND datetime(corrective.executado_em) <= datetime(NEW.executado_em)
  ) THEN RAISE(ABORT, 'EDB_RTS_CORRECTIVE_ACTION_SCOPE_INVALID') END;

  SELECT CASE WHEN NEW.tipo = 'RTS_APPROVAL' AND EXISTS (
    SELECT 1
    FROM edb_acoes_manutencao prior
    WHERE prior.empresa_id = NEW.empresa_id
      AND prior.discrepancia_id = NEW.discrepancia_id
      AND prior.tipo = 'RTS_APPROVAL'
      AND prior.referencia_acao_id = NEW.referencia_acao_id
  ) THEN RAISE(ABORT, 'EDB_RTS_ALREADY_RECORDED_FOR_CORRECTIVE_ACTION') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_auditoria_require_scope_and_chain
BEFORE INSERT ON edb_auditoria_eventos
BEGIN
  SELECT CASE WHEN NEW.diario_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM edb_diarios d
    WHERE d.id = NEW.diario_id
      AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_AUDIT_DIARY_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM edb_registro_revisoes r
    WHERE r.id = NEW.revision_id
      AND r.empresa_id = NEW.empresa_id
      AND r.diario_id = NEW.diario_id
  ) THEN RAISE(ABORT, 'EDB_AUDIT_REVISION_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.situacao_tecnica_id IS NOT NULL
    AND (NEW.voo_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM edb_situacoes_tecnicas s
      WHERE s.id = NEW.situacao_tecnica_id
        AND s.empresa_id = NEW.empresa_id
        AND s.voo_id = NEW.voo_id
    )) THEN RAISE(ABORT, 'EDB_AUDIT_TECHNICAL_SITUATION_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.voo_id IS NOT NULL
    AND NEW.revision_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM edb_registro_revisoes r
      WHERE r.id = NEW.revision_id
        AND r.empresa_id = NEW.empresa_id
        AND r.voo_id = NEW.voo_id
    ) THEN RAISE(ABORT, 'EDB_AUDIT_FLIGHT_REVISION_SCOPE_MISMATCH') END;

  SELECT CASE WHEN trim(NEW.event_type) = ''
    THEN RAISE(ABORT, 'EDB_AUDIT_EVENT_TYPE_REQUIRED') END;

  SELECT CASE WHEN datetime(NEW.occurred_at) IS NULL
    THEN RAISE(ABORT, 'EDB_AUDIT_TIMESTAMP_INVALID') END;

  SELECT CASE WHEN NEW.actor_json IS NOT NULL AND json_valid(NEW.actor_json) <> 1
    THEN RAISE(ABORT, 'EDB_AUDIT_ACTOR_JSON_INVALID') END;

  SELECT CASE WHEN length(NEW.event_hash_sha256) <> 64
    OR NEW.event_hash_sha256 GLOB '*[^0-9a-f]*'
    THEN RAISE(ABORT, 'EDB_AUDIT_EVENT_HASH_INVALID') END;

  SELECT CASE WHEN NEW.previous_event_hash_sha256 IS NOT NULL
    AND (length(NEW.previous_event_hash_sha256) <> 64
      OR NEW.previous_event_hash_sha256 GLOB '*[^0-9a-f]*')
    THEN RAISE(ABORT, 'EDB_AUDIT_PREVIOUS_HASH_INVALID') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_auditoria_eventos prior
    WHERE prior.empresa_id = NEW.empresa_id
      AND prior.diario_id = NEW.diario_id
  ) AND NEW.previous_event_hash_sha256 IS NOT NULL
    THEN RAISE(ABORT, 'EDB_AUDIT_FIRST_EVENT_PREVIOUS_HASH_NOT_NULL') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM edb_auditoria_eventos prior
    WHERE prior.empresa_id = NEW.empresa_id
      AND prior.diario_id = NEW.diario_id
  ) AND NEW.previous_event_hash_sha256 IS NOT (
    SELECT prior.event_hash_sha256
    FROM edb_auditoria_eventos prior
    WHERE prior.empresa_id = NEW.empresa_id
      AND prior.diario_id = NEW.diario_id
    ORDER BY prior.rowid DESC
    LIMIT 1
  ) THEN RAISE(ABORT, 'EDB_AUDIT_PREVIOUS_HASH_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incidente_require_diary_scope
BEFORE INSERT ON edb_incidentes_integridade
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM edb_diarios d
    WHERE d.id = NEW.diario_id
      AND d.empresa_id = NEW.empresa_id
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_DIARY_SCOPE_MISMATCH') END;

  SELECT CASE WHEN NEW.volume_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM edb_volumes v
    WHERE v.id = NEW.volume_id
      AND v.empresa_id = NEW.empresa_id
      AND v.diario_id = NEW.diario_id
  ) THEN RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_VOLUME_SCOPE_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_edb_incidente_identity_immutable
BEFORE UPDATE ON edb_incidentes_integridade
WHEN
  NEW.id <> OLD.id OR
  NEW.empresa_id <> OLD.empresa_id OR
  NEW.diario_id <> OLD.diario_id OR
  COALESCE(NEW.volume_id, '') <> COALESCE(OLD.volume_id, '') OR
  NEW.tipo <> OLD.tipo OR
  NEW.ocorrido_em <> OLD.ocorrido_em OR
  NEW.descricao <> OLD.descricao
BEGIN
  SELECT RAISE(ABORT, 'EDB_INTEGRITY_INCIDENT_IDENTITY_IMMUTABLE');
END;
