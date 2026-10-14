-- AirTrust Player 3: immutable stage-specific official attempts.
-- Versioned additive DDL ONLY; never use to mark a legacy enrollment complete.
-- Prerequisite 0552 lms_native_v1_evidence applied by governed Schema V2.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/lms-player3-module-attempts-0553.md
SELECT json(CASE WHEN
  (SELECT COUNT(*) FROM sqlite_master WHERE name IN
    ('lms_player3_politicas','lms_player3_tentativas_modulares'))=0
  AND (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN
    ('lms_native_edicoes','lms_native_matricula_edicoes','lms_matriculas',
     'lms_matricula_ciclos','lms_cursos'))=5
THEN 'null' ELSE 'PLAYER3_0553_PREFLIGHT_REJECTED' END);

CREATE TABLE lms_player3_politicas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicao_id INTEGER NOT NULL REFERENCES lms_native_edicoes(id),
  empresa_id INTEGER NOT NULL CHECK(empresa_id > 0),
  curso_id INTEGER NOT NULL CHECK(curso_id > 0),
  source_sha256 TEXT NOT NULL CHECK(length(source_sha256)=64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  policy_sha256 TEXT NOT NULL CHECK(length(policy_sha256)=64 AND policy_sha256 NOT GLOB '*[^0-9a-f]*'),
  bank_sha256 TEXT NOT NULL CHECK(length(bank_sha256)=64 AND bank_sha256 NOT GLOB '*[^0-9a-f]*'),
  estado TEXT NOT NULL DEFAULT 'DRAFT' CHECK(estado IN ('DRAFT','APPROVED')),
  approved_at TEXT,
  approver_user_id INTEGER CHECK(approver_user_id > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(edicao_id)
);

CREATE TABLE lms_player3_tentativas_modulares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vinculo_id INTEGER NOT NULL REFERENCES lms_native_matricula_edicoes(id),
  politica_id INTEGER NOT NULL REFERENCES lms_player3_politicas(id),
  etapa_id TEXT NOT NULL CHECK(length(etapa_id) BETWEEN 1 AND 80 AND
    substr(etapa_id,1,1) GLOB '[A-Za-z0-9]' AND etapa_id NOT GLOB '*[^A-Za-z0-9._-]*'),
  tentativa_numero INTEGER NOT NULL CHECK(tentativa_numero BETWEEN 1 AND 500),
  event_id TEXT NOT NULL CHECK(length(event_id) BETWEEN 1 AND 80 AND
    substr(event_id,1,1) GLOB '[A-Za-z0-9]' AND event_id NOT GLOB '*[^A-Za-z0-9._-]*'),
  answers_json TEXT NOT NULL CHECK(length(answers_json) BETWEEN 2 AND 131072),
  answers_sha256 TEXT NOT NULL CHECK(length(answers_sha256)=64 AND answers_sha256 NOT GLOB '*[^0-9a-f]*'),
  score_pct INTEGER NOT NULL CHECK(score_pct BETWEEN 0 AND 100),
  passed INTEGER NOT NULL CHECK(passed IN (0,1)),
  evaluated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(vinculo_id,etapa_id,tentativa_numero),
  UNIQUE(vinculo_id,event_id)
);

CREATE TRIGGER lms_player3_policy_insert BEFORE INSERT ON lms_player3_politicas
BEGIN
  SELECT RAISE(ABORT,'PLAYER3_POLICY_EDITION_SCOPE') WHERE NOT EXISTS (
    SELECT 1 FROM lms_native_edicoes ed WHERE ed.id=NEW.edicao_id
      AND ed.empresa_id=NEW.empresa_id AND ed.curso_id=NEW.curso_id
      AND ed.status='PUBLISHED');
  SELECT RAISE(ABORT,'PLAYER3_POLICY_MUST_START_DRAFT') WHERE
    NEW.estado!='DRAFT' OR NEW.approved_at IS NOT NULL
    OR NEW.approver_user_id IS NOT NULL;
END;

CREATE TRIGGER lms_player3_policy_update BEFORE UPDATE ON lms_player3_politicas
BEGIN
  SELECT RAISE(ABORT,'PLAYER3_POLICY_IMMUTABLE') WHERE
    OLD.estado!='DRAFT' OR NEW.estado!='APPROVED' OR
    NEW.edicao_id!=OLD.edicao_id OR NEW.empresa_id!=OLD.empresa_id OR
    NEW.curso_id!=OLD.curso_id OR NEW.source_sha256!=OLD.source_sha256 OR
    NEW.policy_sha256!=OLD.policy_sha256 OR NEW.bank_sha256!=OLD.bank_sha256 OR
    NEW.created_at!=OLD.created_at OR NEW.id!=OLD.id OR
    NEW.approved_at IS NULL OR NEW.approver_user_id IS NULL OR
    NEW.approver_user_id<=0;
END;
CREATE TRIGGER lms_player3_policy_delete BEFORE DELETE ON lms_player3_politicas
BEGIN SELECT RAISE(ABORT,'PLAYER3_POLICY_IMMUTABLE'); END;

CREATE TRIGGER lms_player3_attempt_insert BEFORE INSERT ON lms_player3_tentativas_modulares
BEGIN
  SELECT RAISE(ABORT,'PLAYER3_STAGE_ACTIVE_SCOPE') WHERE NOT EXISTS (
    SELECT 1 FROM lms_native_matricula_edicoes b
    JOIN lms_player3_politicas p ON p.id=NEW.politica_id
      AND p.edicao_id=b.edicao_id AND p.empresa_id=b.empresa_id
      AND p.curso_id=b.curso_id AND p.estado='APPROVED'
    JOIN lms_native_edicoes ed ON ed.id=b.edicao_id
      AND ed.empresa_id=b.empresa_id AND ed.curso_id=b.curso_id
      AND ed.status='PUBLISHED'
    JOIN lms_matriculas m ON m.id=b.matricula_id AND m.empresa_id=b.empresa_id
      AND m.curso_id=b.curso_id AND m.status='EM_ANDAMENTO'
      AND m.deleted_at IS NULL
    JOIN lms_matricula_ciclos cy ON cy.id=b.ciclo_id AND cy.matricula_id=m.id
      AND cy.empresa_id=m.empresa_id AND cy.curso_id=m.curso_id
      AND cy.funcionario_id=m.funcionario_id AND cy.ciclo_atual=1
      AND cy.status='EM_ANDAMENTO' AND cy.deleted_at IS NULL
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
      AND c.tipo_conteudo='native' AND c.ativo=1
      AND c.publicado=1 AND c.deleted_at IS NULL
    WHERE b.id=NEW.vinculo_id
  );
  SELECT RAISE(ABORT,'PLAYER3_STAGE_SEQUENCE_CONFLICT') WHERE
    NEW.tentativa_numero != (
      SELECT COALESCE(MAX(tentativa_numero),0)+1
        FROM lms_player3_tentativas_modulares
       WHERE vinculo_id=NEW.vinculo_id AND etapa_id=NEW.etapa_id
    );
END;
CREATE TRIGGER lms_player3_attempt_update BEFORE UPDATE ON lms_player3_tentativas_modulares
BEGIN SELECT RAISE(ABORT,'PLAYER3_STAGE_IMMUTABLE'); END;
CREATE TRIGGER lms_player3_attempt_delete BEFORE DELETE ON lms_player3_tentativas_modulares
BEGIN SELECT RAISE(ABORT,'PLAYER3_STAGE_IMMUTABLE'); END;

CREATE INDEX idx_lms_player3_stage_binding
  ON lms_player3_tentativas_modulares(vinculo_id,etapa_id,tentativa_numero);
CREATE INDEX idx_lms_player3_policy_tenant
  ON lms_player3_politicas(empresa_id,curso_id,edicao_id,estado);
