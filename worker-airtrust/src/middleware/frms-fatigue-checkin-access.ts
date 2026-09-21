import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types';
import { getUserPermissionOverride } from './rbac';

export const requireFatigueCheckinAccess: MiddlewareHandler<AppEnv> = async (c, next) => {
  const override = await getUserPermissionOverride(c, 'frms.checkin');
  if (override === 'DENY') {
    return c.json(
      { success: false, error: 'FRMS_CHECKIN_FORBIDDEN', message: 'Check-in de fadiga não habilitado para este usuário.' },
      403,
    );
  }
  await next();
};
