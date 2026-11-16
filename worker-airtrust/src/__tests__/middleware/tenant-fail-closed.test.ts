import { Hono } from 'hono';
import type { Context } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  onMembershipLookup?: () => void;
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
            options.onMembershipLookup?.();
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


describe('tenant middleware — reuso somente na mesma requisição', () => {
  function createNestedApp(db: D1Database, options: { mutateEmpresaId?: number } = {}) {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('userId', 44);
      c.set('empresaId', 7);
      c.set('userRole', 'manager');
      await next();
    });
    app.use('*', tenantMiddleware());
    if (options.mutateEmpresaId) {
      app.use('*', async (c, next) => {
        c.set('empresaId', options.mutateEmpresaId!);
        await next();
      });
    }
    const nested = new Hono<{ Bindings: Env; Variables: Variables }>();
    nested.use('*', tenantMiddleware());
    nested.get('/probe', (c) => c.json({ empresaId: c.get('tenantContext').empresaId }));
    app.route('/nested', nested);
    const env = { DB: db, ENVIRONMENT: 'production' } as unknown as Env;
    return () => app.request('/nested/probe', {}, env);
  }

  it('consulta a associação de tenant só uma vez por request com guard global e router aninhado', async () => {
    const lookup = vi.fn();
    const request = createNestedApp(createDb({
      links: [{ usuarioId: 44, empresaId: 7, role: 'manager' }],
      onMembershipLookup: lookup,
    }));
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ empresaId: 7 });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('reconsulta associação em cada nova requisição e bloqueia revogação', async () => {
    const lookup = vi.fn();
    const links: Link[] = [{ usuarioId: 44, empresaId: 7, role: 'manager' }];
    const request = createNestedApp(createDb({ links, onMembershipLookup: lookup }));
    expect((await request()).status).toBe(200);
    links.length = 0;
    const revoked = await request();
    expect(revoked.status).toBe(403);
    expect((await revoked.json()) as { code: string }).toMatchObject({ code: 'TENANT_ACCESS_DENIED' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('não reutiliza contexto caso o tenant do request seja alterado entre os guards', async () => {
    const lookup = vi.fn();
    const request = createNestedApp(createDb({
      links: [{ usuarioId: 44, empresaId: 7, role: 'manager' }],
      onMembershipLookup: lookup,
    }), { mutateEmpresaId: 8 });
    const response = await request();
    expect(response.status).toBe(403);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('revalida quando permissões do tenantContext são alteradas dentro do request', async () => {
    const lookup = vi.fn();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('userId', 44);
      c.set('empresaId', 7);
      c.set('userRole', 'manager');
      await next();
    });
    app.use('*', tenantMiddleware());
    app.use('*', async (c, next) => {
      c.get('tenantContext').role = 'admin';
      c.get('tenantContext').permissions.push('admin');
      await next();
    });
    const nested = new Hono<{ Bindings: Env; Variables: Variables }>();
    nested.use('*', tenantMiddleware());
    nested.get('/', (c) => c.json({
      role: c.get('tenantContext').role,
      permissions: c.get('tenantContext').permissions,
    }));
    app.route('/nested', nested);
    const response = await app.request('/nested', {}, {
      DB: createDb({
        links: [{ usuarioId: 44, empresaId: 7, role: 'manager' }],
        onMembershipLookup: lookup,
      }), ENVIRONMENT: 'production',
    } as unknown as Env);
    expect(response.status).toBe(200);
    const body = await response.json() as { role: string; permissions: string[] };
    expect(body.role).toBe('manager');
    expect(body.permissions).not.toContain('admin');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('revalida quando o estado da autoridade de plataforma muda dentro do request', async () => {
    const lookup = vi.fn();
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('userId', 44);
      c.set('empresaId', 7);
      c.set('userRole', 'manager');
      await next();
    });
    app.use('*', tenantMiddleware());
    app.use('*', async (c, next) => {
      const state = c.get('platformAccessState');
      if (state) c.set('platformAccessState', { ...state });
      await next();
    });
    const nested = new Hono<{ Bindings: Env; Variables: Variables }>();
    nested.use('*', tenantMiddleware());
    nested.get('/', (c) => c.json({ role: c.get('tenantContext').role }));
    app.route('/nested', nested);
    const response = await app.request('/nested', {}, {
      DB: createDb({
        links: [{ usuarioId: 44, empresaId: 7, role: 'manager' }],
        onMembershipLookup: lookup,
      }), ENVIRONMENT: 'production',
    } as unknown as Env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'manager' });
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('não aceita tenantContext pré-injetado sem validação DB na mesma requisição', async () => {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();
    app.onError(errorHandler);
    app.use('*', async (c, next) => {
      c.set('userId', 44);
      c.set('empresaId', 7);
      c.set('userRole', 'manager');
      c.set('tenantContext', {
        empresaId: 7, empresaCodigo: 'fake', empresaNome: 'Fake',
        role: 'manager', plano: 'pro', permissions: [],
      });
      await next();
    });
    app.use('*', tenantMiddleware());
    app.get('/', (c) => c.json({ empresaId: c.get('tenantContext').empresaId }));
    const response = await app.request('/', {}, {
      DB: createDb(), ENVIRONMENT: 'production',
    } as unknown as Env);
    expect(response.status).toBe(403);
  });
});
