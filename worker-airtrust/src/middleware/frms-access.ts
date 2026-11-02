import type { Context } from 'hono';
import { canSeeFrmsTeamScope } from '../lib/frms/access';
import type { Env } from '../types';
import { getUserPermissionOverride } from './rbac';

export async function canSeeFrmsTeamScopeForContext<E extends { Bindings: Env }>(
  c: Context<E>,
): Promise<boolean> {
  const override = await getUserPermissionOverride(c, 'frms.team.view');
  if (override === 'DENY') return false;
  if (override === 'GRANT') return true;
  return canSeeFrmsTeamScope((c.get as (key: string) => unknown)('userRole'));
}
