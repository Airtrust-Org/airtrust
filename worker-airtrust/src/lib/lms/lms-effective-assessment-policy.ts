/**
 * Effective assessment policy of one enrollment.
 *
 * Open cycles must follow the active edition even when an older import left
 * a stale write-once assessment_policy value on the cycle. Completed cycles
 * retain the edition active when they were completed, not the edition in use
 * when they are reopened later.
 *
 * Schema 0569 forbids updating a non-null cycle policy. For legacy cycles with
 * a stale pin, the immutable ACTIVATED edition audit history provides the
 * completion-time policy without mutating that pin or any learner evidence.
 * If the activation timeline is absent, preserve the original terminal pin.
 */
export const EFFECTIVE_ASSESSMENT_POLICY_SQL = `COALESCE(
  (SELECT CASE
    WHEN cy.status IN ('NAO_INICIADO', 'EM_ANDAMENTO') THEN NULL
    WHEN cy.status = 'CONCLUIDO' AND cy.data_conclusao IS NOT NULL THEN
      COALESCE(
        (SELECT p.assessment_policy
          FROM lms_scorm_package_audit_log a
          JOIN lms_scorm_package_versions p ON p.id=a.package_id
            AND p.empresa_id=a.empresa_id AND p.curso_id=a.curso_id
          WHERE a.empresa_id=m.empresa_id AND a.curso_id=m.curso_id
            AND a.action='ACTIVATED'
            AND datetime(a.created_at)<=datetime(cy.data_conclusao)
          ORDER BY datetime(a.created_at) DESC, a.id DESC LIMIT 1),
        cy.assessment_policy
      )
    ELSE cy.assessment_policy
  END FROM lms_matricula_ciclos cy
    WHERE cy.matricula_id = m.id AND cy.empresa_id = m.empresa_id
      AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL LIMIT 1),
  c.scorm_assessment_policy) AS scorm_assessment_policy`;
