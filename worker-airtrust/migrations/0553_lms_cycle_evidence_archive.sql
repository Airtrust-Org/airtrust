-- 0553: Preserve SCORM/qualification runtime and xAPI across LMS renewal cycles.
-- Additive Schema V2 contract. No data rewrite or retroactive reclassification.
ALTER TABLE lms_xapi_statements ADD COLUMN archived_cycle_id INTEGER REFERENCES lms_matricula_ciclos(id);

CREATE INDEX IF NOT EXISTS idx_lms_xapi_current_cycle
  ON lms_xapi_statements(empresa_id,matricula_id,id)
  WHERE archived_cycle_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lms_xapi_archived_cycle
  ON lms_xapi_statements(empresa_id,archived_cycle_id,id)
  WHERE archived_cycle_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS lms_ciclo_evidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  empresa_id INTEGER NOT NULL,
  matricula_id INTEGER NOT NULL,
  ciclo_id INTEGER NOT NULL,
  enrollment_json TEXT NOT NULL,
  scorm_json TEXT,
  diagnostics_json TEXT,
  course_package_prefix TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (matricula_id) REFERENCES lms_matriculas(id),
  FOREIGN KEY (ciclo_id) REFERENCES lms_matricula_ciclos(id),
  UNIQUE (empresa_id,matricula_id,ciclo_id)
);

CREATE INDEX IF NOT EXISTS idx_lms_ciclo_evidencias_tenant
  ON lms_ciclo_evidencias(empresa_id,matricula_id,ciclo_id);
