/**
 * Canonical read-side domain resolution for qualification history.
 *
 * EAD is a delivery modality and may contain types from different operational
 * domains. Never infer a domain from the category name. When migration 0454 is
 * available, use the same precedence as the write/certificate authorization:
 * historical category snapshot -> explicit per-type override -> type category.
 * Environments without the optional override column retain the pre-0454 safe
 * fallback and continue failing closed when neither category is classified.
 */
export function buildQualificationHistoryDomainColumn(hasTipoDominioOverride: boolean): string {
  return hasTipoDominioOverride
    ? 'COALESCE(qh_categoria_ref.dominio_codigo, qt.dominio_codigo, qt_categoria_ref.dominio_codigo)'
    : 'COALESCE(qh_categoria_ref.dominio_codigo, qt_categoria_ref.dominio_codigo)';
}
