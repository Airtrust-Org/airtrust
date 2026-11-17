/**
 * The assessment policy used for an enrollment.
 *
 * Open cycles follow the current edition even when legacy imports left a
 * stale, immutable policy pin. Terminal cycles retain their historic pin.
 * New SCORM completions also carry a transactionally written audit snapshot
 * of the effective policy (before the open cycle becomes terminal), because
 * Schema V2 0569 forbids changing a non-null assessment_policy on the cycle.
 *
 * Absence of a trusted snapshot never converts an old terminal result.
 */
export const EFFECTIVE_ASSESSMENT_POLICY_SQL = `COALESCE(
  (SELECT CASE
    WHEN cy.status IN ('NAO_INICIADO', 'EM_ANDAMENTO') THEN NULL
    WHEN cy.status = 'CONCLUIDO' THEN COALESCE(
      (SELECT CASE
        WHEN json_valid(a.new_values)
          THEN json_extract(a.new_values,'$.policy')
        ELSE NULL END
        FROM audit_logs a
        WHERE a.empresa_id=m.empresa_id
          AND a.action='LMS_SCORM_COMPLETION_POLICY_SNAPSHOT'
          AND a.entity_type='lms_matricula_ciclos'
          AND a.entity_id=cy.id
        ORDER BY a.id DESC LIMIT 1),
      cy.assessment_policy
    )
    ELSE cy.assessment_policy
  END FROM lms_matricula_ciclos cy
    WHERE cy.matricula_id = m.id AND cy.empresa_id = m.empresa_id
      AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL LIMIT 1),
  c.scorm_assessment_policy) AS scorm_assessment_policy`;
