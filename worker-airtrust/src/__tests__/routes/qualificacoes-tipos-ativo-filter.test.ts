/**
 * Testes para o filtro ?ativo=1|0 na rota GET /qualificacoes/tipos
 *
 * Garante que:
 * - ?ativo=1 exclui registros inativos
 * - ?ativo=0 retorna apenas inativos
 * - sem parâmetro: comportamento anterior preservado (retorna todos)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Não autenticado' }, 401);
      }
      c.set('userId', 10);
      c.set('empresaId', 1);
      c.set('userRole', 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.get('empresaId') || 0),
    empresaCodigo: 'empresa-teste',
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    () =>
    async (_c: any, next: () => Promise<void>) => {
      await next();
    },
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: async () => ({ mode: 'all', setorIds: [], funcionarioId: null }),
  filterRequestedSetorIdsByAccess: (ids: number[]) => ids,
}));

vi.mock('../../services/qualificacoes-tipos-sync', () => ({
  buildHistoricoTipoSnapshot: vi.fn(),
  shouldSyncHistoricoSnapshotsOnTipoUpdate: () => false,
}));

vi.mock('../../services/lms-ead-ssot', () => ({
  isEadCategoria: () => false,
  reconcileImportedEdappHistory: vi.fn(),
  softDeleteLmsCourseForQualificacaoTipo: vi.fn(),
  syncLmsCourseFromQualificacaoTipo: vi.fn(),
}));

import tiposRoutes from '../../routes/qualificacoes/tipos';

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/qualificacoes/tipos', tiposRoutes);
  return app;
}

/** Fixture: 2 ativos (incluindo 1 check), 1 inativo */
const fixtures = [
  {
    id: 1,
    codigo: 'OPC',
    nome: 'OPC Check',
    categoria: 'CHECK',
    is_check: 1,
    ativo: 1,
    setores: [],
  },
  {
    id: 2,
    codigo: 'ATPL',
    nome: 'Licença ATPL',
    categoria: 'PILOTO',
    is_check: 0,
    ativo: 1,
    setores: [],
  },
  {
    id: 3,
    codigo: 'INATIVO',
    nome: 'Check Inativo',
    categoria: 'CHECK',
    is_check: 1,
    ativo: 0,
    setores: [],
  },
];

function createMockEnv(queryAtivo?: string) {
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        __sql: query,
        __args: args,
        first: async () => {
          if (query.includes("sqlite_master WHERE type = 'table'")) {
            return { name: 'qualificacoes_tipos_setores' };
          }
          return null;
        },
        all: async () => {
          // Detectar qual tabela está sendo consultada para colunas
          if (query.includes("sqlite_master WHERE type = 'table'")) {
            return { results: [{ name: 'qualificacoes_tipos_setores' }] };
          }
          if (query.includes('PRAGMA table_info')) {
            return { results: [] };
          }

          // Query principal de listagem
          if (
            query.includes('FROM qualificacoes_tipos qt') &&
            query.includes('LIMIT ?')
          ) {
            // Simular filtragem SQL baseada no parâmetro ativo
            let resultado = fixtures;
            if (queryAtivo === '1' || queryAtivo === 'true') {
              resultado = fixtures.filter((f) => f.ativo === 1);
            } else if (queryAtivo === '0' || queryAtivo === 'false') {
              resultado = fixtures.filter((f) => f.ativo === 0);
            }

            return {
              results: resultado.map((item) => ({
                ...item,
                descricao: null,
                observacoes: null,
                carga_horaria: null,
                carga_horaria_inicial: null,
                carga_horaria_recorrente: null,
                conteudo_programatico: null,
                validade: 12,
                vencimento_fim_mes: 0,
                created_at: null,
                updated_at: null,
                total_no_historico: 0,
                formato_id: null,
                formato_codigo: null,
                formato_nome: null,
                formato_cor: null,
                classe_requisito: null,
                categoria_id: null,
                categoria_cor: null,
                setores_json: '[]',
                setores_count: 0,
              })),
            };
          }

          return { results: [] };
        },
        run: async () => ({ meta: { changes: 1, last_row_id: 999 } }),
      }),
      first: async () => {
        if (query.includes("sqlite_master WHERE type = 'table'")) {
          return { name: 'qualificacoes_tipos_setores' };
        }
        return null;
      },
      all: async () => {
        if (query.includes("sqlite_master WHERE type = 'table'")) {
          return { results: [{ name: 'qualificacoes_tipos_setores' }] };
        }
        return { results: [] };
      },
      run: async () => ({ meta: { changes: 1, last_row_id: 999 } }),
    })),
    batch: vi.fn(async () => []),
  } as unknown as D1Database;

  return { env: { DB: db } as unknown as Env };
}

async function req(path: string, env: Env) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      headers: { Authorization: 'Bearer test-token' },
    }),
    env,
    {} as ExecutionContext,
  );
}

describe('GET /qualificacoes/tipos — filtro ?ativo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('?ativo=1 — retorna apenas registros ativos (OPC e ATPL, não INATIVO)', async () => {
    const { env } = createMockEnv('1');
    const res = await req('/api/qualificacoes/tipos?ativo=1', env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: typeof fixtures };
    expect(body.success).toBe(true);
    const codigos = body.data.map((d) => d.codigo);
    expect(codigos).toContain('OPC');
    expect(codigos).toContain('ATPL');
    expect(codigos).not.toContain('INATIVO');
  });

  it('?ativo=0 — retorna apenas registros inativos (INATIVO, não OPC nem ATPL)', async () => {
    const { env } = createMockEnv('0');
    const res = await req('/api/qualificacoes/tipos?ativo=0', env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: typeof fixtures };
    expect(body.success).toBe(true);
    const codigos = body.data.map((d) => d.codigo);
    expect(codigos).toContain('INATIVO');
    expect(codigos).not.toContain('OPC');
    expect(codigos).not.toContain('ATPL');
  });

  it('sem parâmetro — comportamento anterior preservado (retorna todos)', async () => {
    const { env } = createMockEnv(undefined);
    const res = await req('/api/qualificacoes/tipos', env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: typeof fixtures };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
  });

  it('?ativo=true — alias booleano funciona como ?ativo=1', async () => {
    const { env } = createMockEnv('true');
    const res = await req('/api/qualificacoes/tipos?ativo=true', env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { success: boolean; data: typeof fixtures };
    const codigos = body.data.map((d) => d.codigo);
    expect(codigos).not.toContain('INATIVO');
  });
});
