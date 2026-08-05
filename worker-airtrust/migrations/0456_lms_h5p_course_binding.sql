-- Migration 0456: explicit, tenant-safe association between LMS course and H5P content.
-- source_reference: FRENTE 3 — HARDENING DE UPLOAD SCORM/H5P E CONSISTÊNCIA R2/D1.
-- operational_decision: title is presentation data and must never be a functional key.
-- dry_run_required: yes; validate exact unique r2_key matches before governed application.
-- rollback_plan_required: yes; scripts/rollback/0456_lms_h5p_course_binding.sql.
-- remote_application: prohibited by this PR; use the official Schema V2 workflow only after review.

ALTER TABLE lms_cursos
  ADD COLUMN h5p_conteudo_id INTEGER REFERENCES lms_h5p_conteudos(id);

-- Reconcile only associations that are already unequivocal by tenant + exact R2 key.
-- Ambiguous/absent legacy rows remain NULL and are surfaced for controlled reconciliation.
UPDATE lms_cursos AS c
   SET h5p_conteudo_id = (
     SELECT MIN(h.id)
       FROM lms_h5p_conteudos h
      WHERE h.empresa_id = c.empresa_id
        AND h.r2_key = c.scorm_package_r2_prefix
        AND h.ativo = 1
        AND h.deleted_at IS NULL
   )
 WHERE c.tipo_conteudo = 'h5p'
   AND c.deleted_at IS NULL
   AND c.h5p_conteudo_id IS NULL
   AND c.scorm_package_r2_prefix IS NOT NULL
   AND (
     SELECT COUNT(*)
       FROM lms_h5p_conteudos h
      WHERE h.empresa_id = c.empresa_id
        AND h.r2_key = c.scorm_package_r2_prefix
        AND h.ativo = 1
        AND h.deleted_at IS NULL
   ) = 1;

CREATE UNIQUE INDEX ux_lms_cursos_h5p_conteudo_active
  ON lms_cursos(empresa_id, h5p_conteudo_id)
  WHERE h5p_conteudo_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_lms_cursos_h5p_conteudo
  ON lms_cursos(h5p_conteudo_id)
  WHERE h5p_conteudo_id IS NOT NULL AND deleted_at IS NULL;
