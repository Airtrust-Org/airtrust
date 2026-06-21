import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

const authState = vi.hoisted(() => ({
  role: 'admin',
  userId: 42,
  empresaId: 77,
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('userRole', authState.role);
    c.set('empresaId', authState.empresaId);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => authState.empresaId,
}));

import lmsCursosRoutes from '../../routes/lms-cursos';

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, status);
  });
  app.route('/cursos', lmsCursosRoutes);
  return app;
}

function createCompatDb(options: {
  hasCursoSetores: boolean;
  hasQualificacaoTipoSetores: boolean;
}) {
  const queries: string[] = [];
  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);

      if (query.includes('FROM sqlite_master')) {
        return {
          bind: (tableName: string) => ({
            first: async () => {
              if (tableName === 'lms_cursos_setores') {
                return options.hasCursoSetores ? { ok: 1 } : null;
              }
              if (tableName === 'qualificacoes_tipos_setores') {
                return options.hasQualificacaoTipoSetores ? { ok: 1 } : null;
              }
              return null;
            },
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('SELECT COUNT(*) as n FROM lms_cursos c')) {
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({ n: 0 }),
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('FROM lms_cursos c') && query.includes('ORDER BY c.titulo ASC')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [] }),
            first: async () => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('INSERT INTO lms_cursos')) {
        return {
          bind: (..._args: unknown[]) => ({
            run: async () => ({ meta: { changes: 1, last_row_id: 21 } }),
            first: async () => null,
            all: async () => ({ results: [] }),
          }),
        };
      }

      if (query.includes('INSERT INTO audit_logs')) {
        return {
          bind: (..._args: unknown[]) => ({
            run: async () => ({ meta: { changes: 1, last_row_id: 1 } }),
            first: async () => null,
            all: async () => ({ results: [] }),
          }),
        };
      }

      if (query.includes('conteudo_arquivo_nome') && query.includes('FROM lms_cursos WHERE id = ?')) {
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({
              id: 21,
              empresa_id: authState.empresaId,
              titulo: 'CRM Recorrente',
              tipo_conteudo: 'video',
              publicado: 1,
            }),
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL')) {
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({
              id: 21,
              empresa_id: authState.empresaId,
              titulo: 'CRM Recorrente',
              qualificacao_tipo_id: 4,
              setores_json: null,
            }),
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes('SELECT 1 as ok FROM lms_cursos c')) {
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => null,
            all: async () => ({ results: [] }),
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      if (query.includes("pragma_table_info('setores_gestores')")) {
        return {
          all: async () => ({ results: [{ name: 'usuario_id' }] }),
        };
      }

      if (query.includes('FROM setores_gestores sg')) {
        return {
          bind: (..._args: unknown[]) => ({
            all: async () => ({ results: [{ setor_id: 10 }] }),
            first: async () => null,
            run: async () => ({ meta: { changes: 0, last_row_id: 0 } }),
          }),
        };
      }

      throw new Error(`Unhandled query in lms compat test: ${query}`);
    }),
  } as unknown as D1Database;

  return { db, queries };
}

describe('lms cursos schema compatibility', () => {
  it('lista fail-closed para gestor quando tabelas setoriais nao existem', async () => {
    authState.role = 'GESTOR';
    const { db, queries } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });

    const app = createTestApp();

    const response = await app.request('/cursos?publicados=1', { method: 'GET' }, { DB: db } as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [],
      pagination: { total: 0 },
    });

    const countQuery = queries.find((sql) => sql.includes('SELECT COUNT(*) as n FROM lms_cursos c'));
    expect(countQuery).toContain('AND 1 = 0');
  });

  it('detalhe continua respondendo para admin com setores vazios quando as tabelas nao existem', async () => {
    authState.role = 'admin';
    const { db, queries } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });

    const app = createTestApp();

    const response = await app.request('/cursos/21', { method: 'GET' }, { DB: db } as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 21,
        titulo: 'CRM Recorrente',
        setores: [],
      },
    });

    const detailQuery = queries.find(
      (sql) =>
        sql.includes('WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL') &&
        sql.includes('AS setores_json'),
    );
    expect(detailQuery).toContain('NULL AS setores_json');
  });

  it('cria fail-closed para gestor quando tabelas setoriais nao existem', async () => {
    authState.role = 'GESTOR';
    const { db, queries } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Acesso negado: curso fora do seu escopo de setor',
    });
    expect(queries.some((sql) => sql.includes('INSERT INTO lms_cursos'))).toBe(false);
  });

  it('admin continua criando curso com setores vazios quando tabelas setoriais nao existem', async () => {
    authState.role = 'admin';
    const { db } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });

    const app = createTestApp();

    const response = await app.request(
      '/cursos',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'CRM Recorrente',
          tipo_conteudo: 'video',
          publicado: 1,
          carga_horaria_minutos: 30,
          idioma: 'pt-BR',
        }),
      },
      { DB: db } as Env,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 21,
        titulo: 'CRM Recorrente',
        setores: [],
      },
    });
  });
});
