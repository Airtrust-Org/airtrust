-- 0570: append-only, scoped supersession of an existing formative approval.
-- No backfill and no writes to enrollments, cycles, progress, qualifications or certificates.
-- The 0569 initial approval remains immutable; every renewal preserves its predecessor.
CREATE TABLE lms_scorm_package_approval_renewals (
  id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 16 AND 64),
  approval_id TEXT NOT NULL REFERENCES lms_scorm_package_approvals(id),
  empresa_id INTEGER NOT NULL CHECK(empresa_id>0),
  curso_id INTEGER NOT NULL CHECK(curso_id>0),
  package_id TEXT NOT NULL REFERENCES lms_scorm_package_versions(id),
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64 AND package_sha256 NOT GLOB '*[^0-9a-f]*'),
  sequence INTEGER NOT NULL CHECK(sequence>0),
  previous_attestation_sha256 TEXT NOT NULL CHECK(length(previous_attestation_sha256)=64 AND previous_attestation_sha256 NOT GLOB '*[^0-9a-f]*'),
  attestation_sha256 TEXT NOT NULL CHECK(length(attestation_sha256)=64 AND attestation_sha256 NOT GLOB '*[^0-9a-f]*'),
  approver_id INTEGER NOT NULL CHECK(approver_id>0),
  approval_note TEXT NOT NULL CHECK(length(trim(approval_note)) BETWEEN 10 AND 500),
  editorial_review_ref TEXT CHECK(editorial_review_ref IS NULL OR length(editorial_review_ref) BETWEEN 6 AND 200),
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(approval_id,sequence)
);
CREATE INDEX idx_lms_scorm_approval_renewals_scope
  ON lms_scorm_package_approval_renewals(empresa_id,curso_id,package_id,approval_id,sequence DESC);

CREATE TRIGGER trg_lms_scorm_approval_renewal_scope
BEFORE INSERT ON lms_scorm_package_approval_renewals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM lms_scorm_package_approvals a
    JOIN lms_scorm_package_versions p ON p.id=a.package_id
      AND p.empresa_id=a.empresa_id AND p.curso_id=a.curso_id
    WHERE a.id=NEW.approval_id AND a.empresa_id=NEW.empresa_id
      AND a.curso_id=NEW.curso_id AND a.package_id=NEW.package_id
      AND a.package_sha256=NEW.package_sha256
      AND p.status='VALIDATED' AND p.certification_profile='FORMATIVE_NO_EXAM_V1'
      AND json_valid(p.validation_result_json)
      AND json_extract(p.validation_result_json,'$.formativeCertification.attestationSha256')=NEW.attestation_sha256
  ) THEN RAISE(ABORT,'SCORM_RENEWAL_SCOPE_INVALID') END;
  SELECT CASE WHEN NEW.sequence != COALESCE((
    SELECT MAX(r.sequence) FROM lms_scorm_package_approval_renewals r
    WHERE r.approval_id=NEW.approval_id
  ),0)+1 THEN RAISE(ABORT,'SCORM_RENEWAL_SEQUENCE_INVALID') END;
  SELECT CASE WHEN NEW.previous_attestation_sha256 IS NOT COALESCE((
    SELECT r.attestation_sha256 FROM lms_scorm_package_approval_renewals r
    WHERE r.approval_id=NEW.approval_id ORDER BY r.sequence DESC LIMIT 1
  ),(
    SELECT a.attestation_sha256 FROM lms_scorm_package_approvals a WHERE a.id=NEW.approval_id
  )) THEN RAISE(ABORT,'SCORM_RENEWAL_CHAIN_INVALID') END;
  SELECT CASE WHEN NEW.attestation_sha256=NEW.previous_attestation_sha256
    THEN RAISE(ABORT,'SCORM_RENEWAL_DUPLICATE') END;
END;
CREATE TRIGGER trg_lms_scorm_approval_renewal_no_update
BEFORE UPDATE ON lms_scorm_package_approval_renewals
BEGIN SELECT RAISE(ABORT,'SCORM_RENEWAL_IMMUTABLE'); END;
CREATE TRIGGER trg_lms_scorm_approval_renewal_no_delete
BEFORE DELETE ON lms_scorm_package_approval_renewals
BEGIN SELECT RAISE(ABORT,'SCORM_RENEWAL_IMMUTABLE'); END;
