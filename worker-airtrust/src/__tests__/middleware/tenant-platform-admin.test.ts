import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env, Variables } from '../../types';
import { tenantMiddleware } from '../../middleware/tenant';
import { resetSchemaCache } from '../../utils/db-schema';

let platformAdmin = false;
vi.mock('../../lib/rbac/platform-access', () => ({
  resolvePlatformAccessState: vi.fn(async () => ({ hasPersistedPlatformAdmin: platformAdmin })),
  isPlatformAdminAccess: vi.fn((state: { hasPersistedPlatformAdmin: boolean }) => state.hasPersistedPlatformAdmin),
}));

type Fixture = { membership?: boolean; active?: boolean; empresaId?: number };
function fixtureDb(options: Fixture = {}): D1Database {
  const membership = options.membership ?? false;
  const active = options.active ?? true;
  const empresaId = options.empresaId ?? 7;
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) { params = values; return stmt; },
        async first<T>() {
          if (sql.includes('sqlite_master')) return { found: 1 } as T;
          const selectedEmpresaId = Number(platformAdmin ? params[1] : params[0]);
          if (selectedEmpresaId !== empresaId || !active) return null as T;
          if (sql.includes('JOIN usuarios_empresas') && !membership) return null as T;
          return {
            empresa_id: empresaId, codigo: 'costa-do-sol', nome: 'Costa do Sol',
            plano: 'pro', ativo: 1, role: platformAdmin ? 'admin' : 'manager',
          } as T;
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
}

async function request(options: Fixture, role: string) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.use('*', async (c, next) => {
    c.set('userId', 42);
    c.set('empresaId', options.empresaId ?? 7);
    c.set('userRole', role);
    await next();
  });
  app.use('*', tenantMiddleware());
  app.get('/', (c) => c.json({ role: c.get('tenantContext').role }));
  return app.request('/', {}, {
    DB: fixtureDb(options), ENVIRONMENT: 'production',
  } as unknown as Env);
}

describe('tenantMiddleware — administrador global persistido', () => {
  beforeEach(() => { platformAdmin = false; resetSchemaCache(); });

  it('nega gestor sem vínculo, mesmo com JWT declarando admin', async () => {
    const response = await request({ membership: false }, 'ADMINISTRADOR');
    expect(response.status).toBe(403);
  });

  it('aceita gestor vinculado somente à empresa ativa selecionada', async () => {
    const response = await request({ membership: true }, 'GESTOR');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'manager' });
  });

  it('aceita platform admin persistido em empresa ativa sem vínculo', async () => {
    platformAdmin = true;
    const response = await request({ membership: false }, 'ADMINISTRADOR');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ role: 'admin' });
  });

  it('recusa empresa inativa mesmo para platform admin', async () => {
    platformAdmin = true;
    const response = await request({ membership: false, active: false }, 'ADMINISTRADOR');
    expect(response.status).toBe(403);
  });
});
