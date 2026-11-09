/**
 * Read-only, tenant-scoped resolution of qualification history identities.
 * Historical foreign keys remain untouched. An exact canonical code is used
 * only when the historical foreign key has no active matching type.
 */
export function trainingComplianceHistoryIdentitySql(
  historicalTypeColumn: string,
  hasQualificationCode: boolean,
  hasActiveTypeColumn: boolean,
  carriedTypeColumns: readonly string[] = [],
): { cteSql: string; joins: string; resolvedTypeSql: string } {
  const activeId = hasActiveTypeColumn ? 'AND COALESCE(qt_history_id.ativo, 1) = 1' : '';
  const currentTypeJoin = `
         LEFT JOIN qualificacoes_tipos qt_history_id
           ON qt_history_id.id = qh.${historicalTypeColumn}
          AND qt_history_id.empresa_id = f.empresa_id
          AND qt_history_id.deleted_at IS NULL
          ${activeId}`;
  // The canonical code is normalized once into a materialized CTE so SQLite
  // can hash/index it. Joining on UPPER(TRIM(COALESCE(codigo,''))) directly
  // forces a scan of every tenant type for each history row (rows_read =
  // history rows x tenant types, ~485k in production, #2078).
  // Explicit narrow columns (not SELECT *): with * SQLite stopped choosing an
  // automatic index in production and rescanned the CTE for every history row.
  const carried = carriedTypeColumns.map((name) => `, ${name}`).join('');
  const cteSql = hasQualificationCode
    ? `qt_history_code_idx AS MATERIALIZED (
           SELECT id, empresa_id${carried},
                  UPPER(TRIM(COALESCE(codigo,''))) AS history_code_key
             FROM qualificacoes_tipos
            WHERE deleted_at IS NULL
              ${hasActiveTypeColumn ? 'AND COALESCE(ativo, 1) = 1' : ''})`
    : '';
  const canonicalCodeJoin = hasQualificationCode
    ? `
         LEFT JOIN qt_history_code_idx qt_history_code
           ON qt_history_code.history_code_key =
              UPPER(TRIM(COALESCE(qh.qualificacao_codigo,'')))
          AND qt_history_code.empresa_id = f.empresa_id`
    : '';
  const resolvedTypeSql = hasQualificationCode
    ? `COALESCE(qt_history_id.id, qt_history_code.id, qh.${historicalTypeColumn})`
    : `COALESCE(qt_history_id.id, qh.${historicalTypeColumn})`;
  return { cteSql, joins: currentTypeJoin + canonicalCodeJoin, resolvedTypeSql };
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
    -- This is the canonical legacy EAD category, also recognized by the LMS
    -- enrollment/renewal services. A null historical format must not hide
    -- the governed expiry of an LMS-issued qualification from Compliance.
    WHEN ${category} = 'TREINAMENTO EAD' THEN 'EAD'
    ELSE ${legacy} END`;
}
