/**
 * Training Compliance must never treat a Native player percentage, legacy
 * SCORM completion marker or bare enrollment status as canonical evidence.
 *
 * A governed staging activation may still be stored physically as SCORM.
 * This *read-only* query guard uses the marker if its table exists regardless
 * of feature flags: hiding the Native UI cannot make forged evidence valid.
 * Ordinary legacy SCORM rows retain their existing historical contract.
 */
export function nativeLmsComplianceEvidencePredicate(
  activationTableExists: boolean,
  qualificationHistoryExists: boolean,
): string {
  const isNative = [
    "LOWER(TRIM(COALESCE(c.tipo_conteudo, ''))) = 'native'",
    ...(activationTableExists
      ? ["EXISTS (SELECT 1 FROM lms_native_catalog_activation a " +
          "WHERE a.empresa_id = c.empresa_id AND a.curso_id = c.id)"]
      : []),
  ].join(' OR ');

  // If a snapshot schema has no qualification history table, an alleged
  // completed Native enrollment is never a valid Compliance completion.
  const verifiedQualification = qualificationHistoryExists
    ? `EXISTS (
        SELECT 1 FROM qualificacoes_historico qh
         WHERE qh.id = m.qualificacao_historico_id
           AND qh.empresa_id = m.empresa_id
           AND qh.funcionario_id = m.funcionario_id
           AND qh.qualificacao_id = c.qualificacao_tipo_id
           AND UPPER(TRIM(COALESCE(qh.status, ''))) = 'CONCLUIDA'
           AND qh.deleted_at IS NULL
      )`
    : '0';

  return `(
    NOT (${isNative})
    OR UPPER(TRIM(COALESCE(m.status, ''))) <> 'CONCLUIDO'
    OR ${verifiedQualification}
  )`;
}
