import type { OperationalReadScope } from '../../services/operational-domain-access-core';

/**
 * A shared qualification may be classified in the OPERACOES category but
 * explicitly assigned to a MANUTENCAO setor. For a scoped manager, an active
 * sector link is a narrower authority than category-wide domain access.
 * Keep the tenant, soft-delete and sector membership guards fail-closed.
 */
export function appendQualificationTypeCatalogReadScope(
  conditions: string[],
  bindings: unknown[],
  scope: OperationalReadScope,
  domainColumn: string,
  hasSectorLinks: boolean,
): void {
  if (!scope.restricted) return;
  const domainFilter = scope.domains.length > 0
    ? `${domainColumn} IN (${scope.domains.map(() => '?').join(', ')})`
    : '0 = 1';
  const eligibleSectors = [...new Set(scope.setorIds.filter((id) => Number.isInteger(id) && id > 0))];
  const linkedSectorFilter = hasSectorLinks && eligibleSectors.length > 0
    ? `EXISTS (
       SELECT 1 FROM qualificacoes_tipos_setores qts_read
       JOIN setores s_read
         ON s_read.id=qts_read.setor_id
        AND s_read.empresa_id=qts_read.empresa_id
        AND s_read.ativo=1 AND s_read.deleted_at IS NULL
       WHERE qts_read.tipo_id=qt.id
         AND qts_read.empresa_id=qt.empresa_id
         AND qts_read.deleted_at IS NULL
         AND qts_read.setor_id IN (${eligibleSectors.map(() => '?').join(', ')})
      )`
    : '0 = 1';

  conditions.push(`((${domainFilter}) OR (${linkedSectorFilter}))`);
  bindings.push(...scope.domains, ...(hasSectorLinks ? eligibleSectors : []));
}
