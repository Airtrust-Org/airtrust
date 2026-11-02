-- 0572: published exam plans, edition binding and learner attempts (storage only).
-- Additive DDL, zero backfill. No write to courses, enrollments, cycles, progress,
-- qualifications or certificates. Depends on 0571 (question bank) and 0569 (package versions).
-- A passed attempt is evidence only: completion stays in the canonical LMS writer.
CREATE TABLE lms_exam_plans (
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  curso_id INTEGER NOT NULL CHECK(curso_id>0),
  exam_id TEXT NOT NULL CHECK(length(exam_id) BETWEEN 1 AND 80),
  version INTEGER NOT NULL CHECK(version BETWEEN 1 AND 2147483647),
  plan_json TEXT NOT NULL CHECK(json_valid(plan_json)),
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
  published_by TEXT NOT NULL CHECK(length(published_by) BETWEEN 1 AND 80),
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (empresa_id,curso_id,exam_id,version),
  UNIQUE (empresa_id,curso_id,exam_id,version,plan_sha256)
);

CREATE TABLE lms_exam_edition_bindings (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 16 AND 64),
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  curso_id INTEGER NOT NULL CHECK(curso_id>0),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64 AND package_sha256 NOT GLOB '*[^0-9a-f]*'),
  exam_id TEXT NOT NULL,
  exam_version INTEGER NOT NULL,
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
  statutory_assessment_required INTEGER NOT NULL CHECK(statutory_assessment_required IN (0,1)),
  approver_id INTEGER NOT NULL CHECK(approver_id>0),
  approval_note TEXT NOT NULL CHECK(length(trim(approval_note)) BETWEEN 10 AND 500),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (empresa_id,curso_id,package_sha256),
  FOREIGN KEY (empresa_id,curso_id,exam_id,exam_version,plan_sha256)
    REFERENCES lms_exam_plans(empresa_id,curso_id,exam_id,version,plan_sha256)
);

CREATE TABLE lms_exam_attempts (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 16 AND 64),
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  curso_id INTEGER NOT NULL CHECK(curso_id>0),
  matricula_id INTEGER NOT NULL CHECK(matricula_id>0),
  ciclo_id INTEGER NOT NULL CHECK(ciclo_id>0),
  attempt_no INTEGER NOT NULL CHECK(attempt_no>0),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64 AND package_sha256 NOT GLOB '*[^0-9a-f]*'),
  exam_id TEXT NOT NULL,
  exam_version INTEGER NOT NULL,
  plan_sha256 TEXT NOT NULL CHECK(length(plan_sha256)=64 AND plan_sha256 NOT GLOB '*[^0-9a-f]*'),
  idempotency_key TEXT NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 80),
  state TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(state IN ('IN_PROGRESS','SUBMITTED')),
  started_by INTEGER NOT NULL CHECK(started_by>0),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  passed INTEGER CHECK(passed IS NULL OR passed IN (0,1)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  CHECK(
    (state='IN_PROGRESS' AND submitted_at IS NULL AND passed IS NULL AND result_json IS NULL)
    OR (state='SUBMITTED' AND submitted_at IS NOT NULL AND passed IS NOT NULL AND result_json IS NOT NULL)
  ),
  UNIQUE (empresa_id,matricula_id,ciclo_id,attempt_no),
  UNIQUE (empresa_id,matricula_id,ciclo_id,idempotency_key),
  FOREIGN KEY (empresa_id,curso_id,exam_id,exam_version,plan_sha256)
    REFERENCES lms_exam_plans(empresa_id,curso_id,exam_id,version,plan_sha256)
);
CREATE UNIQUE INDEX uq_lms_exam_attempts_one_open
  ON lms_exam_attempts(empresa_id,matricula_id,ciclo_id) WHERE state='IN_PROGRESS';
CREATE UNIQUE INDEX uq_lms_exam_attempts_one_pass
  ON lms_exam_attempts(empresa_id,matricula_id,ciclo_id) WHERE state='SUBMITTED' AND passed=1;
CREATE INDEX idx_lms_exam_attempts_package
  ON lms_exam_attempts(empresa_id,curso_id,package_sha256,matricula_id,ciclo_id);

CREATE TABLE lms_exam_attempt_responses (
  attempt_id TEXT NOT NULL REFERENCES lms_exam_attempts(id),
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  question_key TEXT NOT NULL CHECK(length(question_key) BETWEEN 1 AND 80),
  choice_id TEXT NOT NULL CHECK(length(choice_id) BETWEEN 1 AND 80),
  answered_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (attempt_id,question_key)
);

CREATE TRIGGER trg_lms_exam_plans_insert_scope
BEFORE INSERT ON lms_exam_plans
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_cursos c WHERE c.id=NEW.curso_id
      AND c.empresa_id=NEW.empresa_id AND c.deleted_at IS NULL
  ) THEN RAISE(ABORT,'LMS_EXAM_PLAN_COURSE_TENANT_MISMATCH') END;
END;
CREATE TRIGGER trg_lms_exam_plans_no_update
BEFORE UPDATE ON lms_exam_plans
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_PLAN_IMMUTABLE'); END;
CREATE TRIGGER trg_lms_exam_plans_no_delete
BEFORE DELETE ON lms_exam_plans
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_PLAN_IMMUTABLE'); END;

CREATE TRIGGER trg_lms_exam_bindings_insert_scope
BEFORE INSERT ON lms_exam_edition_bindings
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_scorm_package_versions p
    WHERE p.empresa_id=NEW.empresa_id AND p.curso_id=NEW.curso_id
      AND p.package_sha256=NEW.package_sha256 AND p.status<>'REJECTED'
  ) THEN RAISE(ABORT,'LMS_EXAM_BINDING_PACKAGE_SCOPE_MISMATCH') END;
END;
CREATE TRIGGER trg_lms_exam_bindings_no_update
BEFORE UPDATE ON lms_exam_edition_bindings
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_BINDING_IMMUTABLE'); END;
CREATE TRIGGER trg_lms_exam_bindings_no_delete
BEFORE DELETE ON lms_exam_edition_bindings
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_BINDING_IMMUTABLE'); END;

CREATE TRIGGER trg_lms_exam_attempts_insert_scope
BEFORE INSERT ON lms_exam_attempts
BEGIN
  SELECT CASE WHEN NEW.state<>'IN_PROGRESS' THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_OPEN_ONLY_INSERT') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_matricula_ciclos ci WHERE ci.id=NEW.ciclo_id
      AND ci.empresa_id=NEW.empresa_id AND ci.matricula_id=NEW.matricula_id
      AND ci.curso_id=NEW.curso_id
  ) THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_CYCLE_SCOPE_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_exam_edition_bindings b
    WHERE b.empresa_id=NEW.empresa_id AND b.curso_id=NEW.curso_id
      AND b.package_sha256=NEW.package_sha256 AND b.exam_id=NEW.exam_id
      AND b.exam_version=NEW.exam_version AND b.plan_sha256=NEW.plan_sha256
  ) THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_BINDING_MISMATCH') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM lms_exam_attempts a WHERE a.empresa_id=NEW.empresa_id
      AND a.matricula_id=NEW.matricula_id AND a.ciclo_id=NEW.ciclo_id
      AND a.state='SUBMITTED' AND a.passed=1
  ) THEN RAISE(ABORT,'LMS_EXAM_ALREADY_PASSED') END;
  SELECT CASE WHEN NEW.attempt_no<>(
    SELECT COALESCE(MAX(a.attempt_no),0)+1 FROM lms_exam_attempts a
    WHERE a.empresa_id=NEW.empresa_id AND a.matricula_id=NEW.matricula_id
      AND a.ciclo_id=NEW.ciclo_id
  ) THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_NUMBER_INVALID') END;
END;
CREATE TRIGGER trg_lms_exam_attempts_update_guard
BEFORE UPDATE ON lms_exam_attempts
BEGIN
  SELECT CASE WHEN OLD.state<>'IN_PROGRESS' THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_SEALED') END;
  SELECT CASE WHEN NEW.id<>OLD.id OR NEW.empresa_id<>OLD.empresa_id
    OR NEW.curso_id<>OLD.curso_id OR NEW.matricula_id<>OLD.matricula_id
    OR NEW.ciclo_id<>OLD.ciclo_id OR NEW.attempt_no<>OLD.attempt_no
    OR NEW.package_sha256<>OLD.package_sha256 OR NEW.exam_id<>OLD.exam_id
    OR NEW.exam_version<>OLD.exam_version OR NEW.plan_sha256<>OLD.plan_sha256
    OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.started_by<>OLD.started_by
    OR NEW.started_at<>OLD.started_at OR NEW.state<>'SUBMITTED'
  THEN RAISE(ABORT,'LMS_EXAM_ATTEMPT_INVALID_TRANSITION') END;
END;
CREATE TRIGGER trg_lms_exam_attempts_no_delete
BEFORE DELETE ON lms_exam_attempts
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_ATTEMPT_DELETE_FORBIDDEN'); END;

CREATE TRIGGER trg_lms_exam_responses_insert_open
BEFORE INSERT ON lms_exam_attempt_responses
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_exam_attempts a WHERE a.id=NEW.attempt_id
      AND a.empresa_id=NEW.empresa_id AND a.state='IN_PROGRESS'
  ) THEN RAISE(ABORT,'LMS_EXAM_RESPONSE_ATTEMPT_NOT_OPEN') END;
END;
CREATE TRIGGER trg_lms_exam_responses_update_open
BEFORE UPDATE ON lms_exam_attempt_responses
BEGIN
  SELECT CASE WHEN NEW.attempt_id<>OLD.attempt_id OR NEW.empresa_id<>OLD.empresa_id
    OR NEW.question_key<>OLD.question_key THEN RAISE(ABORT,'LMS_EXAM_RESPONSE_IDENTITY_IMMUTABLE') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_exam_attempts a WHERE a.id=OLD.attempt_id AND a.state='IN_PROGRESS'
  ) THEN RAISE(ABORT,'LMS_EXAM_RESPONSE_ATTEMPT_NOT_OPEN') END;
END;
CREATE TRIGGER trg_lms_exam_responses_no_delete
BEFORE DELETE ON lms_exam_attempt_responses
BEGIN SELECT RAISE(ABORT,'LMS_EXAM_RESPONSE_DELETE_FORBIDDEN'); END;
