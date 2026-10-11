-- AirTrust Native V1: additive, tenant-scoped durable evidence foundation.
-- Intentionally DOES NOT alter lms_cursos.tipo_conteudo (legacy CHECK).
-- No enrollment, score, qualification, certificate or employee data is modified.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/lms-native-v1-evidence-0549.md
-- Preflight: all four tables must be absent; otherwise fail, never mask drift.
SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM sqlite_master
   WHERE name IN ('lms_native_edicoes','lms_native_matricula_edicoes','lms_native_eventos','lms_native_tentativas'))=0
  AND (SELECT COUNT(*) FROM sqlite_master
   WHERE type='table' AND name IN ('lms_cursos','lms_matriculas','lms_matricula_ciclos'))=3
THEN 'null' ELSE 'NATIVE_0549_PREFLIGHT_REJECTED' END);

CREATE TABLE lms_native_edicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL CHECK(empresa_id > 0),
  curso_id INTEGER NOT NULL CHECK(curso_id > 0),
  artifact_sha256 TEXT NOT NULL CHECK(length(artifact_sha256)=64 AND artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_version TEXT NOT NULL CHECK(length(package_version) BETWEEN 3 AND 80),
  r2_prefix TEXT NOT NULL CHECK(length(r2_prefix) BETWEEN 20 AND 300 AND r2_prefix NOT LIKE '%..%' AND r2_prefix NOT LIKE '%\%'),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','REVIEWED','PUBLISHED','REVOKED')),
  reviewed_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id, curso_id, artifact_sha256),
  UNIQUE(empresa_id, curso_id, package_version),
  UNIQUE(r2_prefix),
  FOREIGN KEY(curso_id) REFERENCES lms_cursos(id)
);

CREATE TABLE lms_native_matricula_edicoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL CHECK(empresa_id > 0),
  curso_id INTEGER NOT NULL CHECK(curso_id > 0),
  matricula_id INTEGER NOT NULL CHECK(matricula_id > 0),
  ciclo_id INTEGER NOT NULL CHECK(ciclo_id > 0),
  edicao_id INTEGER NOT NULL REFERENCES lms_native_edicoes(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id, matricula_id, ciclo_id),
  FOREIGN KEY(matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY(ciclo_id) REFERENCES lms_matricula_ciclos(id)
);

CREATE TABLE lms_native_eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vinculo_id INTEGER NOT NULL REFERENCES lms_native_matricula_edicoes(id),
  event_id TEXT NOT NULL CHECK(length(event_id) BETWEEN 1 AND 80),
  sequencia INTEGER NOT NULL CHECK(sequencia > 0),
  unidade_id TEXT NOT NULL CHECK(length(unidade_id) BETWEEN 1 AND 80),
  payload_sha256 TEXT NOT NULL CHECK(length(payload_sha256)=64 AND payload_sha256 NOT GLOB '*[^0-9a-f]*'),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(vinculo_id, event_id),
  UNIQUE(vinculo_id, sequencia)
);

CREATE TABLE lms_native_tentativas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vinculo_id INTEGER NOT NULL REFERENCES lms_native_matricula_edicoes(id),
  tentativa_numero INTEGER NOT NULL CHECK(tentativa_numero > 0),
  answers_json TEXT NOT NULL CHECK(length(answers_json) BETWEEN 2 AND 131072),
  answers_sha256 TEXT NOT NULL CHECK(length(answers_sha256)=64 AND answers_sha256 NOT GLOB '*[^0-9a-f]*'),
  policy TEXT NOT NULL CHECK(policy IN ('SCORED','FORMATIVE')),
  score_pct INTEGER CHECK(score_pct BETWEEN 0 AND 100),
  assessment_satisfied INTEGER NOT NULL CHECK(assessment_satisfied IN (0,1)),
  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK((policy='FORMATIVE' AND score_pct IS NULL) OR (policy='SCORED' AND score_pct IS NOT NULL)),
  UNIQUE(vinculo_id, tentativa_numero)
);

-- Bindings cannot silently point to another tenant, course or enrollment cycle.
-- Current D1 may not have composite tenant FKs, so explicit fail-closed triggers
-- validate the relationships even when PRAGMA foreign_keys is disabled.
CREATE TRIGGER lms_native_edicoes_tenant_insert BEFORE INSERT ON lms_native_edicoes
BEGIN
  SELECT RAISE(ABORT,'NATIVE_EDITION_COURSE_SCOPE') WHERE NOT EXISTS (
    SELECT 1 FROM lms_cursos c
     WHERE c.id=NEW.curso_id AND c.empresa_id=NEW.empresa_id
       AND c.tipo_conteudo='native' AND c.deleted_at IS NULL
  );
  SELECT RAISE(ABORT,'NATIVE_EDITION_R2_SCOPE') WHERE
    substr(NEW.r2_prefix,1,length('lms/native/' || NEW.empresa_id || '/' || NEW.curso_id || '/')) !=
    ('lms/native/' || NEW.empresa_id || '/' || NEW.curso_id || '/') OR
    instr(NEW.r2_prefix,char(92))>0;
  SELECT RAISE(ABORT,'NATIVE_EDITION_REVIEW_GATE') WHERE
    NEW.status!='DRAFT' OR NEW.reviewed_at IS NOT NULL OR NEW.published_at IS NOT NULL;
END;

CREATE TRIGGER lms_native_edicoes_scope_update BEFORE UPDATE ON lms_native_edicoes
BEGIN
  SELECT RAISE(ABORT,'NATIVE_EDITION_IMMUTABLE') WHERE
    NEW.empresa_id != OLD.empresa_id OR NEW.curso_id != OLD.curso_id OR
    NEW.artifact_sha256 != OLD.artifact_sha256 OR NEW.package_version != OLD.package_version OR
    NEW.r2_prefix != OLD.r2_prefix OR NEW.created_at != OLD.created_at;
  SELECT RAISE(ABORT,'NATIVE_EDITION_REVIEW_IMMUTABLE') WHERE
    OLD.status IN ('PUBLISHED','REVOKED') AND
    (NEW.reviewed_at IS NOT OLD.reviewed_at OR NEW.published_at IS NOT OLD.published_at);
  SELECT RAISE(ABORT,'NATIVE_EDITION_STATE') WHERE NOT (
    (OLD.status='DRAFT' AND NEW.status IN ('DRAFT','REVIEWED')) OR
    (OLD.status='REVIEWED' AND NEW.status IN ('REVIEWED','PUBLISHED')) OR
    (OLD.status='PUBLISHED' AND NEW.status IN ('PUBLISHED','REVOKED')) OR
    (OLD.status='REVOKED' AND NEW.status='REVOKED')
  );
  SELECT RAISE(ABORT,'NATIVE_EDITION_NOT_REVIEWED') WHERE
    NEW.status IN ('REVIEWED','PUBLISHED') AND NEW.reviewed_at IS NULL;
  SELECT RAISE(ABORT,'NATIVE_EDITION_NOT_PUBLISHED') WHERE
    NEW.status IN ('PUBLISHED','REVOKED') AND NEW.published_at IS NULL;
END;

CREATE TRIGGER lms_native_vinculo_tenant_insert BEFORE INSERT ON lms_native_matricula_edicoes
BEGIN
  SELECT RAISE(ABORT,'NATIVE_BINDING_COURSE_TENANT') WHERE NOT EXISTS (
    SELECT 1 FROM lms_matriculas m
    JOIN lms_matricula_ciclos ciclo
      ON ciclo.id=NEW.ciclo_id AND ciclo.matricula_id=m.id
     AND ciclo.empresa_id=m.empresa_id AND ciclo.curso_id=m.curso_id
    JOIN lms_native_edicoes e
      ON e.id=NEW.edicao_id AND e.curso_id=m.curso_id AND e.empresa_id=m.empresa_id
    WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
      AND m.curso_id=NEW.curso_id AND m.deleted_at IS NULL
      AND ciclo.deleted_at IS NULL AND ciclo.ciclo_atual=1 AND e.status='PUBLISHED'
  );
END;

-- Persisted lesson evidence must refer to a real binding even if FK enforcement
-- differs between local SQLite and D1 runtime. A gap/reordering is rejected.
CREATE TRIGGER lms_native_event_scope_sequence BEFORE INSERT ON lms_native_eventos
BEGIN
  SELECT RAISE(ABORT,'NATIVE_EVENT_BINDING_REQUIRED') WHERE NOT EXISTS (
    SELECT 1 FROM lms_native_matricula_edicoes WHERE id=NEW.vinculo_id
  );
  SELECT RAISE(ABORT,'NATIVE_EVENT_SEQUENCE_CONFLICT') WHERE NEW.sequencia !=
    (SELECT COALESCE(MAX(sequencia),0)+1 FROM lms_native_eventos WHERE vinculo_id=NEW.vinculo_id);
END;
CREATE TRIGGER lms_native_attempt_scope BEFORE INSERT ON lms_native_tentativas
BEGIN
  SELECT RAISE(ABORT,'NATIVE_ATTEMPT_BINDING_REQUIRED') WHERE NOT EXISTS (
    SELECT 1 FROM lms_native_matricula_edicoes WHERE id=NEW.vinculo_id
  );
  SELECT RAISE(ABORT,'NATIVE_ATTEMPT_SEQUENCE_CONFLICT') WHERE NEW.tentativa_numero !=
    (SELECT COALESCE(MAX(tentativa_numero),0)+1 FROM lms_native_tentativas WHERE vinculo_id=NEW.vinculo_id);
END;

CREATE TRIGGER lms_native_vinculo_immutable_update BEFORE UPDATE ON lms_native_matricula_edicoes
BEGIN
  SELECT RAISE(ABORT,'NATIVE_BINDING_IMMUTABLE');
END;
CREATE TRIGGER lms_native_vinculo_immutable_delete BEFORE DELETE ON lms_native_matricula_edicoes
BEGIN
  SELECT RAISE(ABORT,'NATIVE_BINDING_IMMUTABLE');
END;
CREATE TRIGGER lms_native_event_immutable_update BEFORE UPDATE ON lms_native_eventos
BEGIN SELECT RAISE(ABORT,'NATIVE_EVENT_IMMUTABLE'); END;
CREATE TRIGGER lms_native_event_immutable_delete BEFORE DELETE ON lms_native_eventos
BEGIN SELECT RAISE(ABORT,'NATIVE_EVENT_IMMUTABLE'); END;
CREATE TRIGGER lms_native_attempt_immutable_update BEFORE UPDATE ON lms_native_tentativas
BEGIN SELECT RAISE(ABORT,'NATIVE_ATTEMPT_IMMUTABLE'); END;
CREATE TRIGGER lms_native_attempt_immutable_delete BEFORE DELETE ON lms_native_tentativas
BEGIN SELECT RAISE(ABORT,'NATIVE_ATTEMPT_IMMUTABLE'); END;

CREATE INDEX idx_lms_native_edicoes_course_status ON lms_native_edicoes(empresa_id,curso_id,status);
CREATE INDEX idx_lms_native_vinculo_edicao ON lms_native_matricula_edicoes(edicao_id);
CREATE INDEX idx_lms_native_eventos_vinculo ON lms_native_eventos(vinculo_id,sequencia);
CREATE INDEX idx_lms_native_tentativas_vinculo ON lms_native_tentativas(vinculo_id,tentativa_numero);
