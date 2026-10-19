/** FRMS reporting projection of the existing employee-sector policy (not a new RBAC). */
import { buildFuncionarioScopeWhere, type EmployeeSectorAccess } from '../../services/employee-sector-access';

/** Read directly for every request; do not cache across role/sector/tenant changes. */
export async function loadFrmsReportCrewScope(
  db: D1Database,
  empresaId: number,
  access: EmployeeSectorAccess,
): Promise<{ scope: { clause: string; bindings: number[] }; ids: ReadonlySet<number> }> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0) {
    throw new Error('FRMS_REPORT_TENANT_REQUIRED');
  }
  const scope = buildFuncionarioScopeWhere(access, 'f');
  const rows = await db.prepare(
    `SELECT f.id FROM funcionarios f
       WHERE f.empresa_id = ? AND f.deleted_at IS NULL AND ${scope.clause}`,
  ).bind(empresaId, ...scope.bindings).all<{ id: number }>();
  return {
    scope,
    ids: new Set((rows.results ?? []).map((row) => Number(row.id))),
  };
}
