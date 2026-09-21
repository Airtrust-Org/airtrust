import type { Context } from 'hono';
import type { Env } from '../../types';
import { getUserPermissionOverride } from '../../middleware/rbac';
import { normalizeAirtrustRole } from '../../utils/role-resolution';

const FRMS_TEAM_SCOPE_ROLES = new Set([
  'ADMINISTRADOR',
  'ADMIN',
  'GESTOR',
  'MANAGER',
  'COORDENACAO',
  'COORDENADOR',
  'COORDINATOR',
]);

export function canSeeFrmsTeamScope(role: unknown): boolean {
  const normalized = normalizeAirtrustRole(role);
  return FRMS_TEAM_SCOPE_ROLES.has(normalized);
}

export async function canSeeFrmsTeamScopeForContext(
  c: Context<{ Bindings: Env }>,
): Promise<boolean> {
  const override = await getUserPermissionOverride(c, 'frms.team.view');
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;
  return canSeeFrmsTeamScope((c.get as (key: string) => unknown)('userRole'));
}
