import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { ExecutionContext } from 'hono';
import frmsRelatoriosConfig from '../../routes/frms-relatorios-config';

// Cria um mock de D1Database mínimo para o resolvePlatformAccessState
function createMockDB(isPlatformAdmin: boolean) {
  return {
    prepare: (sql: string) => {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first() {
          if (sql.includes('sqlite_master')) {
            return { found: 1 };
          }
          return null;
        },
        async all() {
          if (sql.includes('user_platform_roles')) {
            return { results: isPlatformAdmin ? [{ role_code: 'platform_admin' }] : [] };
          }
          if (sql.includes('support_access_grants')) {
            return { results: [] };
          }
          if (sql.includes('frms_configuracao_limites')) {
            return { results: [] };
          }
          return { results: [] };
        },
        async run() {
          return { success: true };
        }
      };
      return statement;
    }
  } as unknown as D1Database;
}

describe('FRMS Configurações Globais RBAC', () => {
  const setupApp = (isPlatformAdmin: boolean) => {
    const app = new Hono<{ Bindings: any; Variables: any }>();
    app.use('*', async (c, next) => {
      c.env = { DB: createMockDB(isPlatformAdmin) };
      c.set('userId', '999');
      await next();
    });
    app.route('/', frmsRelatoriosConfig);
    return app;
  };

  it('deve retornar 403 para admin de tenant comum ao tentar PUT /configuracoes', async () => {
    const app = setupApp(false);
    const req = new Request('http://localhost/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs: [] })
    });
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
    const res = await app.fetch(req, {}, ctx);
    
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe('PLATFORM_ADMIN_REQUIRED');
  });

  it('deve permitir (200) para platform_admin ao tentar PUT /configuracoes', async () => {
    const app = setupApp(true);
    const req = new Request('http://localhost/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configs: [] })
    });
    const ctx = { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} } as ExecutionContext;
    const res = await app.fetch(req, {}, ctx);
    
    expect(res.status).toBe(200);
  });
});
