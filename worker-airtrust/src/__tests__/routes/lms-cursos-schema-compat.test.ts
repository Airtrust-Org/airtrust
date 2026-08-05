import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

const authState = vi.hoisted(() => ({ role: 'admin', userId: 42, empresaId: 77 }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('userRole', authState.role);
    c.set('empresaId', authState.empresaId);
    await next();
  },
}));
vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock('../../routes/escalas-shared', () => ({ getEmpresaIdSafe: () => authState.empresaId }));

import lmsCursosRoutes from '../../routes/lms-cursos';

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Erro interno' },
      status as 403 | 500 | 503,
    );
  });
  app.route('/cursos', lmsCursosRoutes);
  return app;
}

function createCompatDb(options: {
  hasCursoSetores: boolean;
  hasQualificacaoTipoSetores: boolean;
  failSchemaQuery?: boolean;
}) {
  const queries: string[] = [];
  const db = {
    prepare: vi.fn((query: string) => {
      queries.push(query);
      if (query.includes('FROM sqlite_master')) {
        if (options.failSchemaQuery) throw new Error('schema unavailable');
        return {
          bind: (tableName: string) => ({
            first: async () => {
              if (tableName === 'lms_cursos_setores')
                return options.hasCursoSetores ? { ok: 1 } : null;
              if (tableName === 'qualificacoes_tipos_setores')
                return options.hasQualificacaoTipoSetores ? { ok: 1 } : null;
              return null;
            },
          }),
        };
      }
      if (/PRAGMA\s+table_info\s*\(\s*lms_cursos\s*\)/i.test(query)) {
        if (options.failSchemaQuery) throw new Error('schema unavailable');
        return {
          all: async () => ({
            results: [
              { name: 'id' },
              { name: 'empresa_id' },
              { name: 'formato_id' },
              { name: 'dominio_codigo' },
              { name: 'h5p_conteudo_id' },
            ],
          }),
        };
      }
      if (query.includes('SELECT COUNT(*) as n FROM lms_cursos c')) {
        return { bind: () => ({ first: async () => ({ n: 0 }) }) };
      }
      if (query.includes('FROM lms_cursos c') && query.includes('ORDER BY c.titulo ASC')) {
        return { bind: () => ({ all: async () => ({ results: [] }) }) };
      }
      if (query.includes('INSERT INTO lms_cursos')) {
        return { bind: () => ({ run: async () => ({ meta: { changes: 1, last_row_id: 21 } }) }) };
      }
      if (query.includes('INSERT INTO audit_logs')) {
        return { bind: () => ({ run: async () => ({ meta: { changes: 1, last_row_id: 1 } }) }) };
      }
      if (
        query.includes('conteudo_arquivo_nome') &&
        query.includes('FROM lms_cursos WHERE id = ?')
      ) {
        return {
          bind: () => ({
            first: async () => ({
              id: 21,
              empresa_id: 77,
              titulo: 'CRM Recorrente',
              tipo_conteudo: 'video',
              publicado: 1,
            }),
          }),
        };
      }
      if (query.includes('WHERE c.id = ? AND c.empresa_id = ? AND c.deleted_at IS NULL')) {
        return {
          bind: () => ({
            first: async () => ({
              id: 21,
              empresa_id: 77,
              titulo: 'CRM Recorrente',
              qualificacao_tipo_id: 4,
              setores_json: null,
            }),
          }),
        };
      }
      if (query.includes('SELECT 1 as ok FROM lms_cursos c')) {
        return { bind: () => ({ first: async () => null }) };
      }
      if (query.includes("pragma_table_info('setores_gestores')")) {
        return { all: async () => ({ results: [{ name: 'usuario_id' }] }) };
      }
      if (query.includes('FROM setores_gestores sg')) {
        return { bind: () => ({ all: async () => ({ results: [{ setor_id: 10 }] }) }) };
      }
      if (query.includes('operational_domain_rbac_enabled')) {
        return { bind: () => ({ first: async () => ({ operational_domain_rbac_enabled: 0 }) }) };
      }
      throw new Error(`Unhandled query in lms compat test: ${query}`);
    }),
  } as unknown as D1Database;
  return { db, queries };
}

describe('lms cursos schema compatibility', () => {
  it('lista fail-closed para gestor quando tabelas setoriais não existem', async () => {
    authState.role = 'GESTOR';
    const { db, queries } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });
    const response = await createTestApp().request('/cursos?publicados=1', { method: 'GET' }, {
      DB: db,
    } as Env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [],
      pagination: { total: 0 },
    });
    expect(queries.find((sql) => sql.includes('SELECT COUNT(*) as n FROM lms_cursos c'))).toContain(
      'AND 1 = 0',
    );
  });

  it('detalhe continua disponível para admin com setores vazios quando tabelas não existem', async () => {
    authState.role = 'admin';
    const { db } = createCompatDb({ hasCursoSetores: false, hasQualificacaoTipoSetores: false });
    const response = await createTestApp().request('/cursos/21', { method: 'GET' }, {
      DB: db,
    } as Env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: 21, setores: [] },
    });
  });

  it('criação continua fail-closed para gestor sem schema setorial', async () => {
    authState.role = 'GESTOR';
    const { db, queries } = createCompatDb({
      hasCursoSetores: false,
      hasQualificacaoTipoSetores: false,
    });
    const response = await createTestApp().request(
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
    expect(queries.some((sql) => sql.includes('INSERT INTO lms_cursos'))).toBe(false);
  });

  it('diferencia erro de consulta de schema e falha com 503 sem montar SQL presumido', async () => {
    authState.role = 'admin';
    const { db, queries } = createCompatDb({
      hasCursoSetores: true,
      hasQualificacaoTipoSetores: true,
      failSchemaQuery: true,
    });
    const response = await createTestApp().request('/cursos?publicados=1', { method: 'GET' }, {
      DB: db,
    } as Env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Não foi possível confirmar o schema necessário do LMS',
    });
    expect(queries.some((sql) => sql.includes('SELECT COUNT(*) as n FROM lms_cursos c'))).toBe(
      false,
    );
  });
});
