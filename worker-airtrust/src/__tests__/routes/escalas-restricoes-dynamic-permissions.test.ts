import { describe, expect, it, vi } from 'vitest';
import type { MiddlewareHandler } from 'hono';

const { permissionCalls } = vi.hoisted(() => ({
  permissionCalls: [] as Array<[string, string, ...string[]]>,
}));

vi.mock('../../middleware/auth', () => ({
  auth: (): MiddlewareHandler => async (_c, next) => next(),
}));

vi.mock('../../middleware/rbac', () => ({
  requirePermission: (...args: [string, string, ...string[]]): MiddlewareHandler => {
    permissionCalls.push(args);
    return async (_c, next) => next();
  },
}));

import '../../routes/escalas-restricoes';

describe('escalas restricoes dynamic permission contract', () => {
  it('preserves existing baselines while delegating decisions to the canonical server-side authority', () => {
    expect(permissionCalls).toEqual([
      ['escalas', 'visualizar', 'admin', 'manager', 'instructor', 'student', 'viewer', 'editor'],
      ['escalas', 'criar', 'admin', 'manager'],
      ['escalas', 'deletar', 'admin', 'manager'],
    ]);
  });
});
