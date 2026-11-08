import type { QueryClient } from '@tanstack/react-query';
import { tenantQueryKey } from '@/react-app/lib/query-client';

/**
 * A Compliance decision may change applicable rules, LMS enrollments, training
 * summaries and the employee's evidence projections in other modules.
 *
 * Invalidating only `training-compliance` leaves active LMS / Qualification
 * screens displaying stale data until their independent cache TTL expires.
 * Prefix keys deliberately cover all filters and employee/course variants.
 */
export const complianceDependentQueryKeys = [
  ['training-compliance'],
  ['qualification-types'],
  ['qualificacoes'],
  ['historico-qualificacoes'],
  ['lms'],
  ['lms-stats'],
  ['treinamentos-planejados'],
] as const;

// Newer employee/qualification/dashboard hooks are scoped as
// ['tenant', empresaId, module, ...]. Prefixes without that scope do not match.
export function complianceTenantDependentQueryKeys(empresaId?: number | null) {
  return [
    tenantQueryKey(empresaId, 'funcionarios'),
    tenantQueryKey(empresaId, 'dashboard'),
    tenantQueryKey(empresaId, 'qualificacoes'),
    tenantQueryKey(empresaId, 'historico'),
  ];
}

export async function invalidateComplianceDependents(
  client: QueryClient,
  empresaId?: number | null,
): Promise<void> {
  const keys = [
    ...complianceDependentQueryKeys,
    ...complianceTenantDependentQueryKeys(empresaId),
  ];
  await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
}
