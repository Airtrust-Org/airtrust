-- SCORM Package Quality Gate V1. Local migration only; do not apply remotely without approval.
CREATE TABLE lms_scorm_package_versions (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  package_version TEXT NOT NULL,
  package_sha256 TEXT NOT NULL,
  zip_size_bytes INTEGER NOT NULL,
  r2_prefix TEXT NOT NULL,
  launch_file TEXT NOT NULL,
  scorm_versao TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('UPLOADED','VALIDATING','VALIDATED','REJECTED','ACTIVE','SUPERSEDED','LEGACY_UNVERIFIED')),
  validation_version TEXT,
  validation_started_at TEXT,
  validation_finished_at TEXT,
  validation_result_json TEXT,
  rejection_reasons_json TEXT,
  previous_active_package_id TEXT,
  activated_at TEXT,
  activated_by INTEGER,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (curso_id) REFERENCES lms_cursos(id)
);
CREATE UNIQUE INDEX idx_lms_scorm_package_sha_tenant_course ON lms_scorm_package_versions (empresa_id, curso_id, package_sha256);
CREATE UNIQUE INDEX idx_lms_scorm_package_active ON lms_scorm_package_versions (empresa_id, curso_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_lms_scorm_package_course_status ON lms_scorm_package_versions (empresa_id, curso_id, status, uploaded_at DESC);

CREATE TABLE lms_scorm_package_audit_log (
  id TEXT PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  curso_id INTEGER NOT NULL,
  package_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('UPLOAD','VALIDATION_STARTED','VALIDATION_PASSED','VALIDATION_FAILED','ACTIVATED','SUPERSEDED','ROLLED_BACK')),
  actor_id INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (package_id) REFERENCES lms_scorm_package_versions(id)
);
CREATE INDEX idx_lms_scorm_package_audit_course ON lms_scorm_package_audit_log (empresa_id, curso_id, created_at DESC);
