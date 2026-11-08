import type { QueryClient } from '@tanstack/react-query';

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
  ['funcionarios'],
  ['dashboard'],
] as const;

export async function invalidateComplianceDependents(client: QueryClient): Promise<void> {
  await Promise.all(
    complianceDependentQueryKeys.map((queryKey) => client.invalidateQueries({ queryKey })),
  );
}
