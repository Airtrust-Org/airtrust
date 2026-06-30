import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  histCacheMock,
  ensureHistoricoSchemaMock,
  employeeSectorAccessMock,
} = vi.hoisted(() => ({
  histCacheMock: {
    cache: null as null | { key: string; ts: number; data: Record<string, number> },
    inflight: new Map<string, Promise<Record<string, number>>>(),
  },
  ensureHistoricoSchemaMock: vi.fn(),
  employeeSectorAccessMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () =>
    async (
      c: {
        req: { header: (name: string) => string | undefined };
        set: (key: string, value: unknown) => void;
      },
      next: () => Promise<void>,
    ) => {
      c.set('userId', 101);
      c.set('userRole', c.req.header('x-test-user-role') || 'GESTOR');
      c.set('funcionarioId', null);
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({
    empresaId: 6,
    role: 'manager',
  }),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, origem: 'test' }),
}));

vi.mock('../../routes/qualificacoes/historico-write', () => ({
  default: new Hono(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: employeeSectorAccessMock,
  filterRequestedSetorIdsByAccess: (ids: number[]) => ids,
}));

vi.mock('../../routes/qualificacoes/historico-helpers', async () => {
  const actual = await vi.importActual<typeof import('../../routes/qualificacoes/historico-helpers')>(
    '../../routes/qualificacoes/historico-helpers',
  );

  return {
    ...actual,
    histCache: histCacheMock,
    ensureHistoricoSchema: ensureHistoricoSchemaMock,
  };
});

import historicoRouter from '../../routes/qualificacoes/historico';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/historico', historicoRouter);
  return {
    request: (path: string) =>
      app.request(path, undefined, {
        DB: db,
      } as Env),
  };
}

function createMockDb() {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('COUNT(*) as total') && !query.includes('SUM(CASE')) {
            return { total: 3 };
          }

          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });

          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: [{ name: 'renovacao_de' }] };
          }

          if (query.includes('PRAGMA table_info(modelos_aeronave)')) {
            return { results: [{ name: 'modelo' }] };
          }

          if (query.includes('LIMIT ? OFFSET ?')) {
            return {
              results: [
                {
                  id: 703,
                  funcionario_id: 13,
                  funcionario_nome: 'Tripulante Planejado 3',
                  tipo_id: 99,
                  tipo_nome: 'CRM',
                  tipo_codigo: 'CRM',
                  validade_meses: 12,
                  data_realizacao: '2026-10-01',
                  data_vencimento: '2027-10-01',
                  renovada: 0,
                  tem_renovacao_posterior: 0,
                  renovacao_de: null,
                  qualificacao_status: 'PLANEJADA',
                },
              ],
            };
          }

          return { results: [] };
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });
          return { meta: { changes: 0 } };
        },
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualificacoes historico status sort contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    histCacheMock.cache = null;
    histCacheMock.inflight.clear();
    ensureHistoricoSchemaMock.mockResolvedValue(undefined);
    employeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
  });

  it('usa rank server-side para status e preserva filtro planejada com paginação', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request(
      '/historico?statuses=PLANEJADA&orderBy=status&order=ASC&stats=false&limit=2&page=2',
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; status: string }>;
      meta: { total: number; page: number; limit: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta).toMatchObject({ total: 3, page: 2, limit: 2 });
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 703, status: 'PLANEJADA' });

    const totalQuery =
      calls.find(
        (call) =>
          call.method === 'first' &&
          call.query.includes('COUNT(*) as total') &&
          !call.query.includes('SUM(CASE'),
      )?.query || '';
    expect(totalQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'PLANEJADA'");

    const dataCall = calls.find(
      (call) => call.method === 'all' && call.query.includes('LIMIT ? OFFSET ?'),
    );
    expect(dataCall).toBeDefined();
    expect(dataCall?.args.at(-2)).toBe(2);
    expect(dataCall?.args.at(-1)).toBe(2);

    const dataQuery = dataCall?.query || '';
    expect(dataQuery).toContain("WHEN UPPER(COALESCE(qh.status,'')) IN ('PLANEJADA','PLANEJADO') OR qh.data_conclusao IS NULL THEN 1");
    expect(dataQuery).toContain("WHEN COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months')) < date('now') THEN 2");
    expect(dataQuery).toContain("ORDER BY (CASE");
    expect(dataQuery).toContain("END) ASC");
  });

  it('prioriza a validade atual do modelo no historico quando o registro esta vinculado ao tipo', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('COUNT(*) as total') && !query.includes('SUM(CASE')) {
            return { total: 1 };
          }
          if (query.includes('COUNT(*) as total') && query.includes('SUM(CASE')) {
            return {
              total: 1,
              validas: 0,
              vencendo: 0,
              vencidas: 1,
              renovadas: 0,
              planejadas: 0,
            };
          }
          return null;
        },
        all: async () => {
          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: [{ name: 'renovacao_de' }] };
          }
          if (query.includes('PRAGMA table_info(modelos_aeronave)')) {
            return { results: [{ name: 'modelo' }] };
          }
          if (query.includes('LIMIT ? OFFSET ?')) {
            return {
              results: [
                {
                  id: 901,
                  funcionario_id: 77,
                  funcionario_nome: 'Francisco Sergio',
                  tipo_id: 44,
                  tipo_nome: 'MGM - Manual Geral de Manutenção',
                  tipo_codigo: 'MGM',
                  tipo_categoria: 'EAD',
                  historico_validade_meses: 36,
                  tipo_validade_atual: 24,
                  qualificacao_validade: 36,
                  validade_meses: 36,
                  vencimento_fim_mes: 0,
                  data_realizacao: '2018-08-08',
                  data_vencimento: '2021-08-08',
                  renovada: 0,
                  tem_renovacao_posterior: 0,
                  renovacao_de: null,
                  qualificacao_status: 'CONCLUIDA',
                },
              ],
            };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 0 } }),
      });

      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    });

    const response = await app.request('/historico?limit=10&page=1');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; validade_meses: number; data_vencimento: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 901,
      validade_meses: 24,
      data_vencimento: '2020-08-08',
    });
  });

  it('retorna validade_meses null e nao classifica como VENCIDA quando tipo nao tem validade', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('COUNT(*) as total') && !query.includes('SUM(CASE')) {
            return { total: 1 };
          }
          if (query.includes('SUM(CASE')) {
            return { total: 1, validas: 0, vencendo: 0, vencidas: 0, renovadas: 0, planejadas: 0 };
          }
          return null;
        },
        all: async () => {
          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: [{ name: 'renovacao_de' }] };
          }
          if (query.includes('PRAGMA table_info(modelos_aeronave)')) {
            return { results: [{ name: 'modelo' }] };
          }
          if (query.includes('LIMIT ? OFFSET ?')) {
            return {
              results: [
                {
                  id: 501,
                  funcionario_id: 10,
                  funcionario_nome: 'Tecnico Outros',
                  tipo_id: 77,
                  tipo_nome: 'Curso Interno Geral',
                  tipo_codigo: 'CIG',
                  tipo_categoria: 'Outros',
                  historico_validade_meses: null,
                  tipo_validade_atual: null,
                  qualificacao_validade: null,
                  validade_meses: null,
                  vencimento_fim_mes: 0,
                  data_realizacao: '2022-03-10',
                  data_vencimento: null,
                  renovada: 0,
                  tem_renovacao_posterior: 0,
                  renovacao_de: null,
                  qualificacao_status: 'CONCLUIDA',
                },
              ],
            };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 0 } }),
      });
      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    });

    const response = await app.request('/historico?limit=10&page=1');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{
        id: number;
        validade_meses: number | null;
        data_vencimento: string | null;
        status: string;
      }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    const row = body.data[0];
    expect(row.id).toBe(501);
    expect(row.validade_meses).toBeNull();
    expect(row.data_vencimento).toBeNull();
    // Status CONCLUIDA do banco preservado quando sem vencimento definido
    expect(row.status).toBe('CONCLUIDA');
  });

  it('nao classifica como VENCIDA registro sem validade mesmo com data_realizacao antiga', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    (db.prepare as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('COUNT(*) as total') && !query.includes('SUM(CASE')) {
            return { total: 1 };
          }
          if (query.includes('SUM(CASE')) {
            return { total: 1, validas: 0, vencendo: 0, vencidas: 0, renovadas: 0, planejadas: 0 };
          }
          return null;
        },
        all: async () => {
          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: [{ name: 'renovacao_de' }] };
          }
          if (query.includes('PRAGMA table_info(modelos_aeronave)')) {
            return { results: [{ name: 'modelo' }] };
          }
          if (query.includes('LIMIT ? OFFSET ?')) {
            return {
              results: [
                {
                  id: 502,
                  funcionario_id: 11,
                  tipo_id: 78,
                  tipo_nome: 'Curso Antigo',
                  tipo_codigo: 'CA01',
                  tipo_categoria: 'Outros',
                  historico_validade_meses: null,
                  tipo_validade_atual: null,
                  qualificacao_validade: null,
                  validade_meses: null,
                  vencimento_fim_mes: 0,
                  data_realizacao: '2010-01-01',
                  data_vencimento: null,
                  renovada: 0,
                  tem_renovacao_posterior: 0,
                  renovacao_de: null,
                  qualificacao_status: 'CONCLUIDO',
                },
              ],
            };
          }
          return { results: [] };
        },
        run: async () => ({ meta: { changes: 0 } }),
      });
      return {
        bind,
        first: () => bind().first(),
        all: () => bind().all(),
        run: () => bind().run(),
      };
    });

    const response = await app.request('/historico?limit=10&page=1');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ status: string; data_vencimento: string | null; validade_meses: number | null }>;
    };

    expect(response.status).toBe(200);
    const row = body.data[0];
    // Deve ter data_realizacao de 2010 mas sem validade → sem vencimento → não vencida
    expect(row.data_vencimento).toBeNull();
    expect(row.validade_meses).toBeNull();
    expect(row.status).not.toBe('VENCIDA');
    expect(row.status).not.toBe('VENCENDO_30');
  });
});
