-- Schema V2 0565 CANDIDATE. REVIEW ONLY; do not apply remotely without a
-- phase-specific grant, reviewed recovery point, and the official executor.
-- Append-only administrative position credits. Never change legacy grades,
-- SCORM payloads, progress, attempts, completion, qualifications or certificates.
SELECT json(CASE WHEN
 (SELECT foreign_keys FROM pragma_foreign_keys)=1
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN
  ('lms_native_matricula_edicoes','lms_native_edicoes','lms_matriculas',
   'lms_matricula_ciclos','lms_cursos','usuarios','funcionarios',
   'usuarios_empresas_perfis'))=8
 AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table'
      AND name IN ('lms_player3_resume_credit_ledger','lms_player3_resume_credit_intents'))=0
THEN 'null' ELSE 'PLAYER3_RESUME_CREDIT_0565_PREFLIGHT_DENIED' END);

CREATE TABLE lms_player3_resume_credit_uncommittable_guard (
 id INTEGER PRIMARY KEY CHECK(id=1)
);

CREATE TABLE lms_player3_resume_credit_intents (
 nonce TEXT PRIMARY KEY CHECK(length(nonce)=64 AND nonce NOT GLOB '*[^a-f0-9]*'),
 empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
 curso_id INTEGER NOT NULL CHECK(curso_id>0),
 matricula_id INTEGER NOT NULL CHECK(matricula_id>0),
 ciclo_id INTEGER NOT NULL CHECK(ciclo_id>0),
 funcionario_id INTEGER NOT NULL CHECK(funcionario_id>0),
 binding_id INTEGER NOT NULL CHECK(binding_id>0),
 actor_user_id INTEGER NOT NULL CHECK(actor_user_id>0),
 approver_user_id INTEGER NOT NULL CHECK(approver_user_id>0 AND approver_user_id<>actor_user_id),
 uncommittable INTEGER NOT NULL DEFAULT 1
   REFERENCES lms_player3_resume_credit_uncommittable_guard(id)
   DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE lms_player3_resume_credit_ledger (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 idempotency_key TEXT NOT NULL UNIQUE CHECK(length(idempotency_key)=64 AND idempotency_key NOT GLOB '*[^a-f0-9]*'),
 decision_key TEXT NOT NULL UNIQUE CHECK(length(decision_key)=64 AND decision_key NOT GLOB '*[^a-f0-9]*'),
 empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
 curso_id INTEGER NOT NULL CHECK(curso_id>0),
 matricula_id INTEGER NOT NULL CHECK(matricula_id>0),
 ciclo_id INTEGER NOT NULL CHECK(ciclo_id>0),
 funcionario_id INTEGER NOT NULL CHECK(funcionario_id>0),
 binding_id INTEGER NOT NULL REFERENCES lms_native_matricula_edicoes(id),
 source_snapshot_sha256 TEXT NOT NULL CHECK(length(source_snapshot_sha256)=64 AND source_snapshot_sha256 NOT GLOB '*[^a-f0-9]*'),
 source_t0_sha256 TEXT NOT NULL CHECK(length(source_t0_sha256)=64 AND source_t0_sha256 NOT GLOB '*[^a-f0-9]*'),
 source_row_sha256 TEXT NOT NULL CHECK(length(source_row_sha256)=64 AND source_row_sha256 NOT GLOB '*[^a-f0-9]*'),
 original_edition_sha256 TEXT NOT NULL CHECK(length(original_edition_sha256)=64 AND original_edition_sha256 NOT GLOB '*[^a-f0-9]*'),
 destination_edition_sha256 TEXT NOT NULL CHECK(length(destination_edition_sha256)=64 AND destination_edition_sha256 NOT GLOB '*[^a-f0-9]*'),
 source_updated_at TEXT NOT NULL,
 source_scorm_commit_at TEXT,
 historical_progress_pct REAL NOT NULL CHECK(historical_progress_pct BETWEEN 0 AND 99.999),
 resume_unit_id TEXT NOT NULL CHECK(length(resume_unit_id) BETWEEN 1 AND 80),
 manager_user_id INTEGER NOT NULL CHECK(manager_user_id>0),
 second_reviewer_user_id INTEGER NOT NULL CHECK(second_reviewer_user_id>0 AND second_reviewer_user_id<>manager_user_id),
 approved_at TEXT NOT NULL,
 justification TEXT NOT NULL CHECK(length(trim(justification)) BETWEEN 20 AND 1000),
 meaning TEXT NOT NULL DEFAULT 'POSITION_ONLY_NOT_EXAM_OR_COMPLETION'
   CHECK(meaning='POSITION_ONLY_NOT_EXAM_OR_COMPLETION'),
 grants_assessment_pass INTEGER NOT NULL DEFAULT 0 CHECK(grants_assessment_pass=0),
 grants_completion INTEGER NOT NULL DEFAULT 0 CHECK(grants_completion=0),
 grants_qualification INTEGER NOT NULL DEFAULT 0 CHECK(grants_qualification=0),
 grants_certificate INTEGER NOT NULL DEFAULT 0 CHECK(grants_certificate=0),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(ciclo_id) REFERENCES lms_matricula_ciclos(id),
 FOREIGN KEY(matricula_id) REFERENCES lms_matriculas(id),
 FOREIGN KEY(funcionario_id) REFERENCES funcionarios(id)
);

CREATE INDEX idx_lms_player3_resume_credit_scope
 ON lms_player3_resume_credit_ledger(empresa_id,matricula_id,ciclo_id,created_at);

CREATE TRIGGER trg_player3_resume_credit_scope_insert
BEFORE INSERT ON lms_player3_resume_credit_ledger
BEGIN
 SELECT RAISE(ABORT,'PLAYER3_RESUME_CREDIT_SCOPE_DENIED') WHERE NOT EXISTS(
  SELECT 1 FROM lms_matriculas m
  JOIN lms_matricula_ciclos cy ON cy.id=NEW.ciclo_id AND cy.matricula_id=m.id
   AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id
   AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1
   AND cy.status=m.status AND cy.deleted_at IS NULL
  JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
   AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL
  JOIN usuarios actor ON actor.id=NEW.manager_user_id AND actor.active=1 AND actor.deleted_at IS NULL
  JOIN usuarios reviewer ON reviewer.id=NEW.second_reviewer_user_id AND reviewer.active=1 AND reviewer.deleted_at IS NULL
  JOIN usuarios_empresas_perfis actor_profile ON actor_profile.usuario_id=actor.id
   AND actor_profile.empresa_id=NEW.empresa_id AND actor_profile.ativo=1
   AND UPPER(actor_profile.perfil)='GESTOR'
  JOIN usuarios_empresas_perfis reviewer_profile ON reviewer_profile.usuario_id=reviewer.id
   AND reviewer_profile.empresa_id=NEW.empresa_id AND reviewer_profile.ativo=1
   AND UPPER(reviewer_profile.perfil) IN ('ADMIN','ADMINISTRADOR','GESTOR','MANAGER')
  JOIN lms_native_matricula_edicoes b ON b.id=NEW.binding_id
   AND b.empresa_id=m.empresa_id AND b.curso_id=m.curso_id
   AND b.matricula_id=m.id AND b.ciclo_id=cy.id
  JOIN lms_native_edicoes ed ON ed.id=b.edicao_id AND ed.empresa_id=b.empresa_id
   AND ed.curso_id=b.curso_id AND ed.artifact_sha256=NEW.destination_edition_sha256
   AND ed.status='PUBLISHED'
  WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
   AND m.curso_id=NEW.curso_id AND m.funcionario_id=NEW.funcionario_id
   AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO') AND m.deleted_at IS NULL
   AND c.tipo_conteudo='scorm'
   AND EXISTS(SELECT 1 FROM lms_native_catalog_activation a
    WHERE a.empresa_id=c.empresa_id AND a.curso_id=c.id)
 );
 SELECT RAISE(ABORT,'PLAYER3_RESUME_CREDIT_NO_COMPLETION') WHERE
  NEW.grants_assessment_pass<>0 OR NEW.grants_completion<>0 OR
  NEW.grants_qualification<>0 OR NEW.grants_certificate<>0;
END;

CREATE TRIGGER trg_player3_resume_credit_no_update
BEFORE UPDATE ON lms_player3_resume_credit_ledger
BEGIN SELECT RAISE(ABORT,'PLAYER3_RESUME_CREDIT_IMMUTABLE'); END;
CREATE TRIGGER trg_player3_resume_credit_no_delete
BEFORE DELETE ON lms_player3_resume_credit_ledger
BEGIN SELECT RAISE(ABORT,'PLAYER3_RESUME_CREDIT_IMMUTABLE'); END;
CREATE TRIGGER trg_player3_resume_credit_intent_no_update
BEFORE UPDATE ON lms_player3_resume_credit_intents
BEGIN SELECT RAISE(ABORT,'PLAYER3_RESUME_CREDIT_INTENT_IMMUTABLE'); END;
