import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { histCacheMock, ensureHistoricoSchemaMock, ensureModelosAeronaveModeloColumnMock } =
  vi.hoisted(() => ({
    histCacheMock: {
      cache: null as null | { key: string; ts: number; data: Record<string, number> },
      inflight: new Map<string, Promise<Record<string, number>>>(),
    },
    ensureHistoricoSchemaMock: vi.fn(),
    ensureModelosAeronaveModeloColumnMock: vi.fn(),
  }));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 6 }),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, origem: 'test' }),
}));

vi.mock('../../routes/qualificacoes/historico-write', () => ({
  default: new Hono(),
}));

vi.mock('../../routes/qualificacoes/historico-helpers', () => ({
  safe: <T>(handler: T) => handler,
  buildOrderByClause: () => 'qh.data_vencimento ASC',
  generateETag: () => '"test-etag"',
  getCacheTtlMs: () => 30_000,
  histCache: histCacheMock,
  ensureHistoricoSchema: ensureHistoricoSchemaMock,
  ensureModelosAeronaveModeloColumn: ensureModelosAeronaveModeloColumnMock,
  SORTABLE_COLUMNS: new Set(['data_vencimento']),
  MODELO_AERONAVE_EXPR: 'f.modelo_aeronave_id',
  calcularDataVencimento: ({ dataConclusao }: { dataConclusao: string }) => dataConclusao,
}));

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

function createMockDb(options: { hasRenovacaoDe?: boolean } = {}) {
  const hasRenovacaoDe = options.hasRenovacaoDe ?? true;
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });
          if (query.includes('COUNT(*) as total')) {
            return {
              total: 590,
              validas: 300,
              vencendo: 20,
              vencidas: 105,
              renovadas: 160,
              planejadas: 5,
            };
          }
          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });
          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: hasRenovacaoDe ? [{ name: 'renovacao_de' }] : [] };
          }
          if (query.includes('LIMIT ? OFFSET ?')) {
            return {
              results: [
                {
                  id: 501,
                  funcionario_id: 10,
                  funcionario_nome: 'Tripulante Teste',
                  tipo_id: 20,
                  tipo_nome: 'CRM',
                  tipo_codigo: 'CRM',
                  validade_meses: 12,
                  data_realizacao: '2026-01-15',
                  data_vencimento: '2027-01-15',
                  renovada: 0,
                  renovacao_de: 321,
                  qualificacao_status: 'CONCLUIDA',
                },
              ],
            };
          }
          return { results: [] };
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });
          return { meta: { changes: 1 } };
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

describe('qualificacoes historico renovadas contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    histCacheMock.cache = null;
    histCacheMock.inflight.clear();
    ensureHistoricoSchemaMock.mockResolvedValue(undefined);
    ensureModelosAeronaveModeloColumnMock.mockResolvedValue(undefined);
  });

  it('calcula renovadas no stats-extended sem zerar o contador', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico/stats-extended');
    const body = (await response.json()) as { success: boolean; data: { renovadas: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.renovadas).toBe(160);

    const statsQuery = calls.find((call) => call.query.includes('COUNT(*) as total'))?.query || '';
    expect(statsQuery).toContain('COALESCE(qh.renovada, 0) = 1');
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'RENOVADA'");
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'RENOVADO'");
    expect(statsQuery).toContain('qh.renovacao_de IS NOT NULL');
  });

  it('mantem SQL valido quando a coluna renovacao_de ainda nao existe no D1 local', async () => {
    const { db, calls } = createMockDb({ hasRenovacaoDe: false });
    const app = createApp(db);

    const response = await app.request('/historico/stats-extended');
    const body = (await response.json()) as { success: boolean; data: { renovadas: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.renovadas).toBe(160);

    const statsQuery = calls.find((call) => call.query.includes('COUNT(*) as total'))?.query || '';
    expect(statsQuery).not.toContain('qh.renovacao_de');
    expect(statsQuery).toContain('COALESCE(qh.renovada, 0) = 1');
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'RENOVADA'");
  });

  it('filtra e serializa renovadas por flag, status ou vinculo renovacao_de', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico?statuses=RENOVADA');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ status: string; renovacao_de: number }>;
      stats: { renovadas: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stats.renovadas).toBe(160);
    expect(body.data[0]).toMatchObject({ status: 'RENOVADA', renovacao_de: 321 });

    const dataQuery = calls.find((call) => call.method === 'all' && call.query.includes('LIMIT ? OFFSET ?'))?.query || '';
    expect(dataQuery).toContain('qh.renovacao_de');

    const statsQuery = calls.find((call) => call.query.includes('COUNT(*) as total'))?.query || '';
    expect(statsQuery).toContain('qh.renovacao_de IS NOT NULL');
    expect(statsQuery).toContain("UPPER(COALESCE(qh.status, '')) = 'RENOVADA'");
  });
});
