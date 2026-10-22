-- 0566: immutable intra-cycle SCORM edition handoff evidence.
-- Schema only: no enrollment resets, no remote data mutation at migration time.
CREATE TABLE IF NOT EXISTS lms_scorm_edition_handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  matricula_id INTEGER NOT NULL,
  ciclo_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  funcionario_id INTEGER NOT NULL,
  operation_id TEXT NOT NULL UNIQUE CHECK(length(operation_id) BETWEEN 16 AND 120),
  actor_id INTEGER NOT NULL CHECK(actor_id>0),
  previous_enrollment_json TEXT NOT NULL CHECK(json_valid(previous_enrollment_json)),
  previous_scorm_json TEXT,
  previous_diagnostics_json TEXT,
  previous_package_prefix TEXT,
  target_package_sha256 TEXT NOT NULL CHECK(length(target_package_sha256)=64
    AND target_package_sha256 NOT GLOB '*[^0-9a-f]*'),
  target_package_prefix TEXT NOT NULL,
  resume_plan_json TEXT NOT NULL CHECK(json_valid(resume_plan_json)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id,matricula_id,ciclo_id,target_package_sha256),
  FOREIGN KEY(matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY(ciclo_id) REFERENCES lms_matricula_ciclos(id)
);
CREATE INDEX IF NOT EXISTS idx_lms_scorm_handoffs_scope
  ON lms_scorm_edition_handoffs(empresa_id,matricula_id,ciclo_id,id);

CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_handoff_scope
BEFORE INSERT ON lms_scorm_edition_handoffs BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_matriculas m
    JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id AND cy.empresa_id=m.empresa_id
    JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id
    JOIN lms_scorm_package_versions p ON p.empresa_id=m.empresa_id AND p.curso_id=m.curso_id
    WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
      AND m.curso_id=NEW.curso_id AND m.funcionario_id=NEW.funcionario_id
      AND m.deleted_at IS NULL AND m.status IN ('NAO_INICIADO','EM_ANDAMENTO')
      AND m.qualificacao_historico_id IS NULL
      AND cy.id=NEW.ciclo_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
      AND c.deleted_at IS NULL AND c.tipo_conteudo='scorm'
      AND p.status='ACTIVE' AND p.package_sha256=NEW.target_package_sha256
      AND p.r2_prefix=NEW.target_package_prefix
      AND c.scorm_package_r2_prefix=p.r2_prefix
  ) THEN RAISE(ABORT,'SCORM_EDITION_HANDOFF_SCOPE_INVALID') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_handoff_no_update
BEFORE UPDATE ON lms_scorm_edition_handoffs
BEGIN SELECT RAISE(ABORT,'SCORM_EDITION_HANDOFF_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_handoff_no_delete
BEFORE DELETE ON lms_scorm_edition_handoffs
BEGIN SELECT RAISE(ABORT,'SCORM_EDITION_HANDOFF_IMMUTABLE'); END;
