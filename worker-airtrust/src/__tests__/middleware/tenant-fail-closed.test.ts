import { Hono } from 'hono';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../middleware/error-handler';
import { tenantMiddleware } from '../../middleware/tenant';
import type { Env, Variables } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

type Link = {
  usuarioId: number;
  empresaId: number;
  role: string;
};

function createDb(options: {
  links?: Link[];
  platformRoleUserIds?: number[];
} = {}) {
  const links = options.links || [];
  const platformRoleUserIds = new Set(options.platformRoleUserIds || []);

  return {
    prepare: (sql: string) => {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes("name = 'usuarios_empresas'")) return { found: 1 } as T;
          if (sql.includes("name = 'user_platform_roles'")) return { found: 1 } as T;
          if (sql.includes("name = 'support_access_grants'")) return { found: 1 } as T;

          if (sql.includes('JOIN usuarios_empresas ue')) {
            const empresaId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const link = links.find((item) => item.empresaId === empresaId && item.usuarioId === userId);
            if (!link) return null as T;
            return {
              empresa_id: empresaId,
              codigo: `tenant-${empresaId}`,
              nome: `Tenant ${empresaId}`,
              plano: 'pro',
              ativo: 1,
              role: link.role,
            } as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM user_platform_roles')) {
            const userId = Number(statement.params[0]);
            return {
              results: platformRoleUserIds.has(userId) ? [{ role_code: 'platform_admin' }] : [],
            } as T;
          }
          if (sql.includes('FROM support_access_grants')) {
            return { results: [] } as T;
          }
          return { results: [] } as T;
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function buildApp(db: D1Database, params: { userId: number; empresaId: number; role?: string }) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError(errorHandler);
  app.use('*', async (c, next) => {
    c.set('userId', params.userId);
    c.set('empresaId', params.empresaId);
    c.set('userRole', params.role || 'admin');
    await tenantMiddleware()(c as unknown as Context<{ Bindings: Env }>, next);
  });
  app.get('/probe', (c) => c.json({ success: true, tenant: c.get('tenantContext') }));

  return app.request('/probe', {}, { DB: db, ENVIRONMENT: 'production' } as unknown as Env);
}

beforeEach(() => {
  resetSchemaCache();
});

describe('tenant middleware fail-closed behavior', () => {
  it('allows a user only when usuarios_empresas confirms the tenant link', async () => {
    const response = await buildApp(
      createDb({ links: [{ usuarioId: 44, empresaId: 7, role: 'manager' }] }),
      { userId: 44, empresaId: 7 },
    );

    const payload = (await response.json()) as { tenant?: { empresaId: number; role: string } };

    expect(response.status).toBe(200);
    expect(payload.tenant).toMatchObject({ empresaId: 7, role: 'manager' });
  });

  it('fails closed when JWT carries a tenant without usuarios_empresas link', async () => {
    const response = await buildApp(createDb(), { userId: 44, empresaId: 7 });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('does not choose a fallback tenant for persisted platform admins', async () => {
    const response = await buildApp(createDb({ platformRoleUserIds: [99] }), {
      userId: 99,
      empresaId: 7,
    });
    const payload = (await response.json()) as { code?: string };

    expect(response.status).toBe(403);
    expect(payload.code).toBe('TENANT_ACCESS_DENIED');
  });
});
