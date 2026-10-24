-- 0542_lms_scorm_formative_assessment_policy.sql
-- Authoritative course-level assessment intent. Default SCORED is fail-closed.
-- Never create scores, completions, qualifications, or certificates by migration.
-- dry_run_required: true
-- rollback_plan_required: worker-airtrust/schema-v2/plans/lms-scorm-formative-assessment-0542.md
ALTER TABLE lms_cursos
  ADD COLUMN scorm_assessment_policy TEXT NOT NULL DEFAULT 'SCORED'
  CHECK(scorm_assessment_policy IN ('SCORED', 'FORMATIVE'));

-- Specific tenant-6 CRM for RBAC 119 directors: the package explicitly
-- describes formative, non-eliminatory activities and participation completion.
-- Preflight MUST confirm exactly one target course, with runtime evidence checked
-- read-only, before this governed update is applied.
UPDATE lms_cursos
   SET scorm_assessment_policy='FORMATIVE',
       scorm_mastery_score=NULL,
       updated_at=datetime('now')
 WHERE empresa_id=6
   AND tipo_conteudo='scorm'
   AND deleted_at IS NULL
   AND TRIM(titulo) IN (
     'CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)',
     'CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)'
   );
