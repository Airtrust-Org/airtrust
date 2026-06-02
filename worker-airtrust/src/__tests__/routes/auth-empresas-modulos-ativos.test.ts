import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { resetSchemaCache } from '../../utils/db-schema';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', Number(c.req.header('x-test-user-id') || 10));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 1));
      c.set('userRole', 'admin');
      await next();
    },
}));

import { authRoutes } from '../../routes/auth';

interface MockEmpresa {
  id: number;
  nome: string;
  codigo: string;
  logo_url: string | null;
  modulos_ativos: string | null;
}

interface MockLink {
  usuario_id: number;
  empresa_id: number;
  role: string;
  is_primary: number;
}

function createAuthApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/auth', authRoutes);
  return app;
}

function createDb(empresas: MockEmpresa[], links: MockLink[]): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...params: unknown[]) {
          statement.params = params;
          return statement;
        },
        async first<T>() {
          if (sql.includes("sqlite_master") && sql.includes("name = 'usuarios_empresas'")) {
            return { found: 1 } as T;
          }

          if (sql.includes('SELECT ue.empresa_id') && sql.includes('FROM usuarios_empresas ue')) {
            const userId = Number(statement.params[0]);
            const link = [...links]
              .filter((item) => item.usuario_id === userId)
              .sort((a, b) => b.is_primary - a.is_primary || a.empresa_id - b.empresa_id)[0];
            return (link ? { empresa_id: link.empresa_id } : null) as T;
          }

          return null as T;
        },
        async all<T>() {
          if (sql.includes('FROM empresas e') && !sql.includes('FROM usuarios_empresas ue')) {
            const empresaAtualId = Number(statement.params[0]);
            return {
              results: empresas
                .map((empresa) => ({
                  ...empresa,
                  role: 'admin',
                  is_primary: empresa.id === empresaAtualId ? 1 : 0,
                  is_current: empresa.id === empresaAtualId ? 1 : 0,
                }))
                .sort((a, b) => b.is_current - a.is_current || a.nome.localeCompare(b.nome)),
            } as T;
          }

          if (sql.includes('FROM usuarios_empresas ue')) {
            const empresaAtualId = Number(statement.params[0]);
            const userId = Number(statement.params[1]);
            const linkedEmpresaIds = new Set(
              links.filter((link) => link.usuario_id === userId).map((link) => link.empresa_id),
            );

            return {
              results: empresas
                .filter((empresa) => linkedEmpresaIds.has(empresa.id))
                .map((empresa) => {
                  const link = links.find(
                    (item) => item.usuario_id === userId && item.empresa_id === empresa.id,
                  );

                  return {
                    ...empresa,
                    role: link?.role ?? 'member',
                    is_primary: link?.is_primary ?? 0,
                    is_current: empresa.id === empresaAtualId ? 1 : 0,
                  };
                })
                .sort((a, b) => b.is_current - a.is_current || b.is_primary - a.is_primary),
            } as T;
          }

          return { results: [] } as T;
        },
      };

      return statement;
    },
  } as unknown as D1Database;
}

async function getEmpresas(db: D1Database, userId = 10) {
  const app = createAuthApp();
  const response = await app.fetch(
    new Request('http://localhost/api/auth/empresas', {
      headers: {
        Authorization: 'Bearer test-token',
        'x-test-user-id': String(userId),
      },
    }),
    { DB: db } as Env,
    {} as ExecutionContext,
  );

  return response;
}

describe('GET /api/auth/empresas modulos_ativos contract', () => {
  beforeEach(() => {
    resetSchemaCache();
  });

  it('retorna modulos_ativos como array normalizado quando a empresa tem config explicita', async () => {
    const db = createDb(
      [
        {
          id: 1,
          nome: 'Empresa A',
          codigo: 'empresa-a',
          logo_url: null,
          modulos_ativos: '["dashboard","funcionarios","lms"]',
        },
      ],
      [{ usuario_id: 10, empresa_id: 1, role: 'admin', is_primary: 1 }],
    );

    const response = await getEmpresas(db);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.empresas[0].modulos_ativos).toEqual(['dashboard', 'funcionarios', 'lms']);
  });

  it('mantem modulos_ativos null quando empresa nao tem config, sem virar bloqueio vazio', async () => {
    const db = createDb(
      [{ id: 1, nome: 'Empresa A', codigo: 'empresa-a', logo_url: null, modulos_ativos: null }],
      [{ usuario_id: 10, empresa_id: 1, role: 'admin', is_primary: 1 }],
    );

    const response = await getEmpresas(db);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.empresas[0].modulos_ativos).toBeNull();
  });

  it('preserva campos existentes do contrato de /api/auth/empresas', async () => {
    const db = createDb(
      [{ id: 1, nome: 'Empresa A', codigo: 'empresa-a', logo_url: '/logo.png', modulos_ativos: '[]' }],
      [{ usuario_id: 10, empresa_id: 1, role: 'gestor', is_primary: 1 }],
    );

    const response = await getEmpresas(db);
    const json = await response.json();
    const empresa = json.data.empresas[0];

    expect(empresa).toMatchObject({
      id: 1,
      nome: 'Empresa A',
      codigo: 'empresa-a',
      logo_url: '/logo.png',
      role: 'gestor',
      is_primary: 1,
      is_current: 1,
      modulos_ativos: [],
    });
    expect(json.data.empresaAtualId).toBe(1);
  });

  it('nao retorna empresa B para usuario vinculado apenas ao tenant A', async () => {
    const db = createDb(
      [
        { id: 1, nome: 'Empresa A', codigo: 'empresa-a', logo_url: null, modulos_ativos: '["dashboard"]' },
        { id: 2, nome: 'Empresa B', codigo: 'empresa-b', logo_url: null, modulos_ativos: '["lms"]' },
      ],
      [{ usuario_id: 10, empresa_id: 1, role: 'admin', is_primary: 1 }],
    );

    const response = await getEmpresas(db);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.empresas).toHaveLength(1);
    expect(json.data.empresas[0].codigo).toBe('empresa-a');
  });
});

