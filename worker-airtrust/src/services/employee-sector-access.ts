import type { Context } from 'hono';
import { resolveEmployeeSectorAccess, type EmployeeSectorAccess } from '../lib/rbac/employee-sector-access';

// Regras puras vivem em lib/rbac/employee-sector-access; este módulo mantém o
// adaptador do Context do Hono e re-exporta a API pública existente.
export * from '../lib/rbac/employee-sector-access';

export async function getEmployeeSectorAccess(
  c: Context<any>,
  empresaId: number,
): Promise<EmployeeSectorAccess> {
  const getContextValue = c.get as (key: string) => unknown;
  const userId = Number(getContextValue('userId') || 0);
  const userRole = getContextValue('userRole');
  const funcionarioId = Number(getContextValue('funcionarioId') || 0);

  return resolveEmployeeSectorAccess(c.env.DB, empresaId, userId, userRole, {
    funcionarioId: Number.isInteger(funcionarioId) && funcionarioId > 0 ? funcionarioId : null,
  });
}
