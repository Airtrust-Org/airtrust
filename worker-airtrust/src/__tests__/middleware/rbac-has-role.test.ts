import { describe, expect, it } from 'vitest';
import type { Context } from 'hono';
import type { Env } from '../../types';
import { hasRole } from '../../middleware/rbac';

type RbacTestContext = Context<{
  Bindings: Env;
  Variables: { userRole: string };
}>;

function contextWithRole(role: string | undefined): RbacTestContext {
  return {
    get: ((key: string) => (key === 'userRole' ? role : undefined)) as RbacTestContext['get'],
  } as RbacTestContext;
}

describe('hasRole RBAC regression', () => {
  it('preserves role authorization for a typed Hono context', () => {
    const context = contextWithRole('GESTOR');

    expect(hasRole(context, 'manager')).toBe(true);
    expect(hasRole(context, 'admin')).toBe(false);
  });

  it('denies access when the context has no role', () => {
    expect(hasRole(contextWithRole(undefined), 'admin', 'manager')).toBe(false);
  });
});
