/**
 * Effective assessment policy of one enrollment.
 *
 * The course column is only the policy of the CURRENT edition. A cycle that was
 * frozen at an edition switch (`lms_matricula_ciclos.assessment_policy`) keeps
 * the rules under which it ended; a NULL cycle policy means the cycle has not
 * ended yet and follows the active edition. Historical completions are never
 * reclassified by a later edition.
 */
export const EFFECTIVE_ASSESSMENT_POLICY_SQL = `COALESCE(
  (SELECT CASE
    -- An open cycle follows the active edition, even if an older migration
    -- incorrectly left a pinned policy. Only terminal cycles keep their pin.
    WHEN cy.status IN ('NAO_INICIADO', 'EM_ANDAMENTO') THEN NULL
    ELSE cy.assessment_policy
  END FROM lms_matricula_ciclos cy
    WHERE cy.matricula_id = m.id AND cy.empresa_id = m.empresa_id
      AND cy.ciclo_atual = 1 AND cy.deleted_at IS NULL LIMIT 1),
  c.scorm_assessment_policy) AS scorm_assessment_policy`;
