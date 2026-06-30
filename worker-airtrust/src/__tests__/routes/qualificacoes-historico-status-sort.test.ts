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
});
