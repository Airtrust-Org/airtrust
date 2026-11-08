import type { QueryClient } from '@tanstack/react-query';
import { tenantQueryKey } from '@/react-app/lib/query-client';

/**
 * A change in an employee's assignment can change the applicable Compliance
 * matrix, the due-training roster, and dashboard counters without changing
 * the Compliance rules themselves.
 */
export function employeeComplianceQueryPrefixes(empresaId?: number | null) {
  return [
    ['training-compliance'],
    ['treinamentos-planejados'],
    ['lms'],
    tenantQueryKey(empresaId, 'funcionarios'),
    tenantQueryKey(empresaId, 'dashboard'),
  ] as const;
}

/**
 * A confirmed/cancelled qualification or terminal LMS enrollment can change
 * the evidence backing Compliance, Qualificações, certificates and dashboards.
 * Re-query the authoritative endpoints instead of synthesizing statuses here.
 */
export function trainingEvidenceQueryPrefixes(empresaId?: number | null) {
  return [
    ...employeeComplianceQueryPrefixes(empresaId),
    ['qualificacoes'],
    ['qualification-types'],
    ['historico-qualificacoes'],
    ['lms-stats'],
    tenantQueryKey(empresaId, 'qualificacoes'),
    tenantQueryKey(empresaId, 'qualificacoes-historico'),
    tenantQueryKey(empresaId, 'historico'),
  ] as const;
}

export async function invalidateEmployeeComplianceProjections(
  client: QueryClient,
  empresaId?: number | null,
): Promise<void> {
  await Promise.all(
    employeeComplianceQueryPrefixes(empresaId).map(
      (queryKey) => client.invalidateQueries({ queryKey }),
    ),
  );
}

export async function invalidateTrainingEvidenceProjections(
  client: QueryClient,
  empresaId?: number | null,
): Promise<void> {
  await Promise.all(
    trainingEvidenceQueryPrefixes(empresaId).map(
      (queryKey) => client.invalidateQueries({ queryKey }),
    ),
  );
}
