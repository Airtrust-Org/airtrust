/**
 * Read-only, tenant-scoped resolution of qualification history identities.
 * Historical foreign keys remain untouched. An exact canonical code is used
 * only when the historical foreign key has no active matching type.
 */
export function trainingComplianceHistoryIdentitySql(
  historicalTypeColumn: string,
  hasQualificationCode: boolean,
  hasActiveTypeColumn: boolean,
): { joins: string; resolvedTypeSql: string } {
  const activeId = hasActiveTypeColumn ? 'AND COALESCE(qt_history_id.ativo, 1) = 1' : '';
  const activeCode = hasActiveTypeColumn ? 'AND COALESCE(qt_history_code.ativo, 1) = 1' : '';
  const currentTypeJoin = `
         LEFT JOIN qualificacoes_tipos qt_history_id
           ON qt_history_id.id = qh.${historicalTypeColumn}
          AND qt_history_id.empresa_id = f.empresa_id
          AND qt_history_id.deleted_at IS NULL
          ${activeId}`;
  const canonicalCodeJoin = hasQualificationCode
    ? `
         LEFT JOIN qualificacoes_tipos qt_history_code
           ON qt_history_code.empresa_id = f.empresa_id
          AND qt_history_code.deleted_at IS NULL
          ${activeCode}
          AND UPPER(TRIM(COALESCE(qt_history_code.codigo,''))) =
              UPPER(TRIM(COALESCE(qh.qualificacao_codigo,'')))`
    : '';
  const resolvedTypeSql = hasQualificationCode
    ? `COALESCE(qt_history_id.id, qt_history_code.id, qh.${historicalTypeColumn})`
    : `COALESCE(qt_history_id.id, qh.${historicalTypeColumn})`;
  return { joins: currentTypeJoin + canonicalCodeJoin, resolvedTypeSql };
}


/**
 * Unclassified historical format inherits a recognized modality from the
 * authoritative qualification model. An explicitly classified historical
 * format is never overwritten, even if it conflicts with the current model.
 * Requires only the already tenant-scoped model joins above; no DB writes.
 */
export function trainingComplianceHistoricalModalitySql(
  hasHistoricalFormat: boolean,
  hasModelType: boolean,
  hasHistoricalCode: boolean,
  hasModelCategory: boolean,
): string {
  const legacy = hasHistoricalFormat ? "UPPER(TRIM(COALESCE(qh.formato_codigo,'')))" : "''";
  if (!hasModelType && !hasModelCategory) return legacy;
  const canonicalValue = (field: string) => hasHistoricalCode
    ? `UPPER(TRIM(COALESCE(NULLIF(TRIM(qt_history_id.${field}),''),qt_history_code.${field},'')))`
    : `UPPER(TRIM(COALESCE(qt_history_id.${field},'')))`;
  const model = hasModelType ? canonicalValue('tipo') : "''";
  const category = hasModelCategory ? canonicalValue('categoria') : "''";
  const recognized = "('PRATICO','PRÁTICO','PRESENCIAL','EAD','HIBRIDO','DOCUMENTAL','OUTRA')";
  return `CASE WHEN ${legacy} NOT IN ('','NAO_CLASSIFICADO') THEN ${legacy}
    WHEN ${model} IN ${recognized} THEN ${model}
    WHEN ${category} IN ${recognized} THEN ${category}
    ELSE ${legacy} END`;
}
