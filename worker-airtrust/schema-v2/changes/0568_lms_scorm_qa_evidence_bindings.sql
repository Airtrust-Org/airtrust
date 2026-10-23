-- Staging-only F5 synthetic QA evidence binding; never auto-apply to production.
-- Schema V2 review, recovery, tenant and environment gates are mandatory.
CREATE TABLE lms_scorm_qa_evidence_bindings (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  package_id TEXT NOT NULL,
  package_sha256 TEXT NOT NULL CHECK(length(package_sha256)=64),
  matricula_id INTEGER NOT NULL,
  ciclo_id INTEGER NOT NULL,
  staging_runtime_sha TEXT NOT NULL CHECK(length(staging_runtime_sha)=40),
  approval_receipt_sha256 TEXT NOT NULL CHECK(length(approval_receipt_sha256)=64),
  run_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  launched_package_sha256 TEXT CHECK(launched_package_sha256 IS NULL OR length(launched_package_sha256)=64),
  last_committed_package_sha256 TEXT CHECK(last_committed_package_sha256 IS NULL OR length(last_committed_package_sha256)=64),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED','EXPIRED')),
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK(synthetic=1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(empresa_id,curso_id,package_id,matricula_id,ciclo_id,run_id),
  FOREIGN KEY(matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY(ciclo_id) REFERENCES lms_matricula_ciclos(id)
);

CREATE UNIQUE INDEX uq_lms_scorm_qa_active_enrollment
 ON lms_scorm_qa_evidence_bindings(empresa_id,matricula_id) WHERE status='ACTIVE';
CREATE INDEX idx_lms_scorm_qa_scope
 ON lms_scorm_qa_evidence_bindings(empresa_id,curso_id,package_id,package_sha256,matricula_id);

-- Never trust plan-supplied candidate/enrollment/cycle identity.
CREATE TRIGGER trg_lms_scorm_qa_binding_insert_scope
BEFORE INSERT ON lms_scorm_qa_evidence_bindings
BEGIN
 SELECT CASE WHEN NEW.status!='ACTIVE' OR julianday(NEW.expires_at) IS NULL
   OR julianday(NEW.expires_at)<=julianday('now')
   OR (NEW.launched_package_sha256 IS NOT NULL AND NEW.launched_package_sha256!=NEW.package_sha256)
   OR (NEW.last_committed_package_sha256 IS NOT NULL AND
       (NEW.launched_package_sha256 IS NULL OR NEW.last_committed_package_sha256!=NEW.package_sha256))
   OR NOT EXISTS (
     SELECT 1 FROM lms_scorm_package_versions p
     JOIN lms_cursos c ON c.id=p.curso_id AND c.empresa_id=p.empresa_id
     WHERE p.id=NEW.package_id AND p.package_sha256=NEW.package_sha256
       AND p.empresa_id=NEW.empresa_id AND p.curso_id=NEW.curso_id
       AND p.status='VALIDATED' AND c.deleted_at IS NULL
       AND (c.scorm_package_r2_prefix IS NULL OR c.scorm_package_r2_prefix!=p.r2_prefix)
   )
   OR NOT EXISTS (
     SELECT 1 FROM lms_matriculas m
     JOIN lms_matricula_ciclos cy ON cy.matricula_id=m.id
     WHERE m.id=NEW.matricula_id AND m.empresa_id=NEW.empresa_id
       AND m.curso_id=NEW.curso_id AND m.deleted_at IS NULL
       AND cy.id=NEW.ciclo_id AND cy.empresa_id=NEW.empresa_id
       AND cy.curso_id=NEW.curso_id AND cy.ciclo_atual=1 AND cy.deleted_at IS NULL
   )
 THEN RAISE(ABORT,'SCORM_QA_BINDING_SCOPE_INVALID') END;
END;

-- Immutable source authority and monotonic witnesses; terminal states cannot be revived.
CREATE TRIGGER trg_lms_scorm_qa_binding_update_integrity
BEFORE UPDATE ON lms_scorm_qa_evidence_bindings
BEGIN
 SELECT CASE WHEN NEW.id!=OLD.id OR NEW.empresa_id!=OLD.empresa_id
   OR NEW.curso_id!=OLD.curso_id OR NEW.package_id!=OLD.package_id
   OR NEW.package_sha256!=OLD.package_sha256 OR NEW.matricula_id!=OLD.matricula_id
   OR NEW.ciclo_id!=OLD.ciclo_id OR NEW.staging_runtime_sha!=OLD.staging_runtime_sha
   OR NEW.approval_receipt_sha256!=OLD.approval_receipt_sha256
   OR NEW.run_id!=OLD.run_id OR NEW.expires_at!=OLD.expires_at
   OR NEW.synthetic!=1 OR NEW.created_at!=OLD.created_at
   OR (OLD.status!='ACTIVE' AND
       (NEW.status!=OLD.status OR NEW.launched_package_sha256 IS NOT OLD.launched_package_sha256
        OR NEW.last_committed_package_sha256 IS NOT OLD.last_committed_package_sha256))
   OR (OLD.launched_package_sha256 IS NOT NULL AND
       NEW.launched_package_sha256 IS NOT OLD.launched_package_sha256)
   OR (OLD.last_committed_package_sha256 IS NOT NULL AND
       NEW.last_committed_package_sha256 IS NOT OLD.last_committed_package_sha256)
   OR (NEW.launched_package_sha256 IS NOT NULL AND NEW.launched_package_sha256!=NEW.package_sha256)
   OR (NEW.last_committed_package_sha256 IS NOT NULL AND
       (NEW.launched_package_sha256 IS NULL OR NEW.last_committed_package_sha256!=NEW.package_sha256))
 THEN RAISE(ABORT,'SCORM_QA_BINDING_IMMUTABLE_OR_UNVERIFIED') END;
END;

CREATE TRIGGER trg_lms_scorm_qa_binding_no_delete
BEFORE DELETE ON lms_scorm_qa_evidence_bindings
BEGIN SELECT RAISE(ABORT,'SCORM_QA_BINDING_NO_DELETE'); END;
