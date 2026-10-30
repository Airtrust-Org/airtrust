-- 0569: edition-pinned SCORM assessment policy + backend-owned package approvals.
-- Schema only: no backfill, no reset, and no write to scores, completions,
-- qualifications, certificates, enrollments or the course pointer.
--
-- 1) A SCORM edition (lms_scorm_package_versions) may carry a server-derived,
--    write-once assessment policy and certification profile.
-- 2) A learner cycle (lms_matricula_ciclos) may carry a write-once policy
--    snapshot. NULL means "follows the active edition"; the Worker freezes
--    started cycles inside the same D1 batch that switches editions.
-- 3) lms_scorm_package_approvals is append-only evidence of the authenticated
--    administrative approval of one immutable ZIP for one tenant/course.
ALTER TABLE lms_scorm_package_versions ADD COLUMN assessment_policy TEXT
  CHECK(assessment_policy IS NULL OR assessment_policy IN ('SCORED','FORMATIVE'));
ALTER TABLE lms_scorm_package_versions ADD COLUMN certification_profile TEXT
  CHECK(certification_profile IS NULL OR certification_profile IN ('FORMATIVE_NO_EXAM_V1'));
ALTER TABLE lms_matricula_ciclos ADD COLUMN assessment_policy TEXT
  CHECK(assessment_policy IS NULL OR assessment_policy IN ('SCORED','FORMATIVE'));

CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_edition_profile_consistent
BEFORE INSERT ON lms_scorm_package_versions
WHEN NEW.certification_profile IS NOT NULL
 AND NEW.assessment_policy IS NOT 'FORMATIVE'
BEGIN SELECT RAISE(ABORT,'SCORM_EDITION_PROFILE_POLICY_MISMATCH'); END;

CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_edition_policy_immutable
BEFORE UPDATE OF assessment_policy, certification_profile ON lms_scorm_package_versions
WHEN (OLD.assessment_policy IS NOT NULL AND NEW.assessment_policy IS NOT OLD.assessment_policy)
  OR (OLD.certification_profile IS NOT NULL AND NEW.certification_profile IS NOT OLD.certification_profile)
BEGIN SELECT RAISE(ABORT,'SCORM_EDITION_POLICY_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_lms_ciclo_policy_immutable
BEFORE UPDATE OF assessment_policy ON lms_matricula_ciclos
WHEN OLD.assessment_policy IS NOT NULL AND NEW.assessment_policy IS NOT OLD.assessment_policy
BEGIN SELECT RAISE(ABORT,'LMS_CYCLE_POLICY_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS lms_scorm_package_approvals (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 16 AND 64),
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  curso_id INTEGER NOT NULL CHECK(curso_id>0),
  package_id TEXT NOT NULL,
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64
    AND package_sha256 NOT GLOB '*[^0-9a-f]*'),
  certification_profile TEXT NOT NULL CHECK(certification_profile IN ('FORMATIVE_NO_EXAM_V1')),
  attestation_sha256 TEXT NOT NULL CHECK(length(attestation_sha256)=64
    AND attestation_sha256 NOT GLOB '*[^0-9a-f]*'),
  editorial_review_ref TEXT CHECK(editorial_review_ref IS NULL
    OR length(editorial_review_ref) BETWEEN 6 AND 200),
  approver_id INTEGER NOT NULL CHECK(approver_id>0),
  approval_note TEXT NOT NULL CHECK(length(trim(approval_note)) BETWEEN 10 AND 500),
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id,curso_id,package_id),
  FOREIGN KEY(package_id) REFERENCES lms_scorm_package_versions(id)
);
CREATE INDEX IF NOT EXISTS idx_lms_scorm_approvals_scope
  ON lms_scorm_package_approvals(empresa_id,curso_id,package_sha256);

CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_approval_scope
BEFORE INSERT ON lms_scorm_package_approvals BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_scorm_package_versions p
    JOIN lms_cursos c ON c.id=p.curso_id AND c.empresa_id=p.empresa_id
    WHERE p.id=NEW.package_id AND p.empresa_id=NEW.empresa_id
      AND p.curso_id=NEW.curso_id AND p.package_sha256=NEW.package_sha256
      AND p.status='VALIDATED'
      AND p.certification_profile=NEW.certification_profile
      AND c.deleted_at IS NULL AND c.tipo_conteudo='scorm'
  ) THEN RAISE(ABORT,'SCORM_APPROVAL_SCOPE_INVALID') END;
END;
CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_approval_no_update
BEFORE UPDATE ON lms_scorm_package_approvals
BEGIN SELECT RAISE(ABORT,'SCORM_APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_lms_scorm_approval_no_delete
BEFORE DELETE ON lms_scorm_package_approvals
BEGIN SELECT RAISE(ABORT,'SCORM_APPROVAL_IMMUTABLE'); END;
