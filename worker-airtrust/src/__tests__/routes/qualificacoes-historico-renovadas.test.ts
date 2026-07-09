import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  histCacheMock,
  ensureHistoricoSchemaMock,
  ensureModelosAeronaveModeloColumnMock,
  employeeSectorAccessMock,
} = vi.hoisted(() => ({
  histCacheMock: {
    cache: null as null | { key: string; ts: number; data: Record<string, number> },
    inflight: new Map<string, Promise<Record<string, number>>>(),
  },
  ensureHistoricoSchemaMock: vi.fn(),
  ensureModelosAeronaveModeloColumnMock: vi.fn(),
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
      c.set('userId', Number(c.req.header('x-test-user-id') || '101'));
      c.set('userRole', c.req.header('x-test-user-role') || 'GESTOR');
      c.set(
        'funcionarioId',
        c.req.header('x-test-context-funcionario-id')
          ? Number(c.req.header('x-test-context-funcionario-id'))
          : null,
      );
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: { req: { header: (name: string) => string | undefined } }) => ({
    empresaId: Number(c.req.header('x-test-empresa-id') || '6'),
    role: c.req.header('x-test-tenant-role') || 'manager',
  }),
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

vi.mock('../../services/employee-sector-access', () => ({
  getEmployeeSectorAccess: employeeSectorAccessMock,
  filterRequestedSetorIdsByAccess: (ids: number[]) => ids,
}));

import historicoRouter from '../../routes/qualificacoes/historico';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/historico', historicoRouter);
  return {
    request: (path: string, headers?: Record<string, string>) =>
      app.request(
        path,
        headers
          ? {
              headers,
            }
          : undefined,
        {
          DB: db,
        } as Env,
      ),
  };
}

function createMockDb(options: {
  hasRenovacaoDe?: boolean;
  statsResults?: Array<{
    total: number;
    validas: number;
    vencendo: number;
    vencidas: number;
    renovadas: number;
    planejadas: number;
  }>;
} = {}) {
  const hasRenovacaoDe = options.hasRenovacaoDe ?? true;
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const statsResults = [...(options.statsResults || [])];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });
          const statsQuery = query.includes('COUNT(*) as total');
          const globalQuery =
            query.includes('SUM(CASE WHEN') && query.toUpperCase().includes('AS RENOVADAS');
          if (statsQuery || globalQuery) {
            return (
              statsResults.shift() || {
                total: 590,
                validas: 300,
                vencendo: 20,
                vencidas: 105,
                renovadas: 160,
                planejadas: 5,
              }
            );
          }
          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });
          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: hasRenovacaoDe ? [{ name: 'renovacao_de' }] : [] };
          }
          if (query.includes('LIMIT ? OFFSET ?')) {
            if (query.includes('qh.id = ?') && query.includes("date('now','+30 days')")) {
              if (!query.includes('AS vigente_operacional')) {
                return { results: [] };
              }

              return {
                results: [
                  {
                    id: 503,
                    funcionario_id: 10,
                    funcionario_nome: 'Tripulante Teste',
                    tipo_id: 21,
                    tipo_nome: 'NR-12',
                    tipo_codigo: 'NR-12',
                    validade_meses: 12,
                    data_realizacao: '2026-06-01',
                    data_vencimento: '2099-12-31',
                    renovada: 1,
                    tem_renovacao_posterior: 0,
                    renovacao_de: null,
                    vigente_operacional: 1,
                    qualificacao_status: 'RENOVADA',
                  },
                ],
              };
            }
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
                  tem_renovacao_posterior: 1,
                  renovacao_de: null,
                  qualificacao_status: 'CONCLUIDA',
                },
                {
                  id: 502,
                  funcionario_id: 10,
                  funcionario_nome: 'Tripulante Teste',
                  tipo_id: 20,
                  tipo_nome: 'G1-SEM',
                  tipo_codigo: 'G1-SEM',
                  validade_meses: 12,
                  data_realizacao: '2026-05-01',
                  data_vencimento: '2027-05-01',
                  renovada: 0,
                  tem_renovacao_posterior: 0,
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
    employeeSectorAccessMock.mockResolvedValue({
      mode: 'all',
      setorIds: [],
      funcionarioId: null,
    });
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
    expect(statsQuery).toContain('qh_renovadora.renovacao_de = qh.id');
    expect(statsQuery).toContain('qh_newer.id > qh.id');
  });

  it('mantem SQL valido quando a coluna renovacao_de ainda nao existe no D1 local', async () => {
    const { db, calls } = createMockDb({ hasRenovacaoDe: false });
    const app = createApp(db);

    const response = await app.request('/historico/stats-extended');
    const body = (await response.json()) as { success: boolean; data: { renovadas: number } };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.renovadas).toBe(160);

    const statsQuery =
      calls.find((call) => call.query.includes('COUNT(*) as total'))?.query || '';
    expect(statsQuery).not.toContain('qh.renovacao_de');
    expect(statsQuery).toContain('qh_newer.id > qh.id');
  });

  it('filtra e serializa renovadas pelo registro anterior que recebeu renovacao posterior', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico?statuses=RENOVADA');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; status: string; renovacao_de: number | null }>;
      stats: { renovadas: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stats.renovadas).toBe(160);
    expect(body.data[0]).toMatchObject({ id: 501, status: 'RENOVADA', renovacao_de: null });

    const dataQuery =
      calls.find((call) => call.method === 'all' && call.query.includes('LIMIT ? OFFSET ?'))
        ?.query || '';
    expect(dataQuery).toContain('qh.renovacao_de');

    const statsQuery =
      calls.find((call) => call.query.includes('COUNT(*) as total'))?.query || '';
    expect(statsQuery).toContain('qh_renovadora.renovacao_de = qh.id');
    expect(statsQuery).toContain('qh_newer.id > qh.id');
  });

  it('tem_renovacao_posterior da linha usa o mesmo guard de vigencia operacional do contador (regressao AW139/Altemir)', async () => {
    // Bug real: qh.renovacao_de gravado na direção invertida (registro antigo
    // apontando para o registro atual) fazia o EXISTS bruto da linha marcar
    // como RENOVADA o registro que é, na verdade, o vigente operacional —
    // mesmo quando o contador (activeRenewedQualificationPredicate) já
    // excluía esse caso corretamente. A linha deve usar o MESMO predicado.
    const { db, calls } = createMockDb();
    const app = createApp(db);

    await app.request('/historico');

    const dataQuery =
      calls.find((call) => call.method === 'all' && call.query.includes('LIMIT ? OFFSET ?'))
        ?.query || '';

    const posteriorIdx = dataQuery.indexOf('AS tem_renovacao_posterior');
    const vigenteIdx = dataQuery.indexOf('AS vigente_operacional');
    expect(posteriorIdx).toBeGreaterThan(-1);
    expect(vigenteIdx).toBeGreaterThan(-1);

    // A coluna tem_renovacao_posterior precisa excluir o registro que é o
    // vigente operacional (nenhum qh_newer mais recente da mesma
    // qualificação) — igual ao que activeRenewedQualificationPredicate faz
    // para o contador global. Sem essa exclusão, um link renovacao_de
    // gravado ao contrário derruba o registro atual como RENOVADA.
    // A checagem "qh_newer" (mesma usada por vigente_operacional) precisa
    // aparecer também antes da coluna tem_renovacao_posterior — prova de que
    // ambas as colunas compartilham o mesmo guard de vigência operacional.
    const occurrencesBeforePosterior = dataQuery
      .slice(0, posteriorIdx)
      .split('qh_newer.funcionario_id = qh.funcionario_id').length - 1;
    expect(occurrencesBeforePosterior).toBeGreaterThanOrEqual(1);
  });

  it('mantem a sessao vigente com renovacao_de como valida quando nao houve substituicao posterior', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; status: string; renovacao_de: number | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data[1]).toMatchObject({ id: 502, status: 'VALIDA', renovacao_de: 321 });
  });

  it('inclui como valida operacional o ultimo registro futuro mesmo quando legado o marcou como renovada', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico?statuses=VALIDA&id=503');
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; status: string; vigente_operacional?: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: 503,
        status: 'VALIDA',
        vigente_operacional: 1,
      }),
    ]);
  });

  it('honra stats=false e evita agregacoes pesadas para a query planejada', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico?statuses=PLANEJADA&stats=false&limit=500');
    const body = (await response.json()) as {
      success: boolean;
      meta: { total: number };
      stats?: unknown;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.meta.total).toBe(590);
    expect(body).not.toHaveProperty('stats');

    const fullStatsQueries = calls.filter(
      (call) => call.query.includes('COUNT(*) as total') && call.query.includes('SUM(CASE'),
    );
    const globalCountsQueries = calls.filter(
      (call) =>
        !call.query.includes('COUNT(*) as total') &&
        call.query.includes('SUM(CASE WHEN') &&
        call.query.toUpperCase().includes('AS RENOVADAS'),
    );
    const totalOnlyQueries = calls.filter(
      (call) => call.query.includes('COUNT(*) as total') && !call.query.includes('SUM(CASE'),
    );

    expect(fullStatsQueries).toHaveLength(0);
    expect(globalCountsQueries).toHaveLength(0);
    expect(totalOnlyQueries).toHaveLength(1);
  });

  it('mantem stats populado no comportamento padrao', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico?limit=1');
    const body = (await response.json()) as {
      success: boolean;
      stats?: { total: number; validas: number; renovadas: number; planejadas: number };
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.stats).toBeDefined();
    expect(body.stats).toMatchObject({
      total: 590,
      validas: 300,
      renovadas: 160,
      planejadas: 5,
    });
  });

  it('memoiza o PRAGMA de renovacao_de por isolate', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const first = await app.request('/historico');
    const second = await app.request('/historico?statuses=RENOVADA');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const pragmaCalls = calls.filter((call) =>
      call.query.includes('PRAGMA table_info(qualificacoes_historico)'),
    );
    expect(pragmaCalls.length).toBeLessThanOrEqual(1);
  });

  it('isola o cache de stats-extended por usuario, perfil e escopo setorial', async () => {
    employeeSectorAccessMock
      .mockResolvedValueOnce({
        mode: 'restricted',
        setorIds: [7],
        funcionarioId: null,
      })
      .mockResolvedValueOnce({
        mode: 'restricted',
        setorIds: [9],
        funcionarioId: null,
      });
    const { db, calls } = createMockDb({
      statsResults: [
        {
          total: 11,
          validas: 7,
          vencendo: 1,
          vencidas: 2,
          renovadas: 1,
          planejadas: 0,
        },
        {
          total: 22,
          validas: 14,
          vencendo: 2,
          vencidas: 4,
          renovadas: 2,
          planejadas: 0,
        },
      ],
    });
    const app = createApp(db);

    const firstResponse = await app.request('/historico/stats-extended', {
      'x-test-user-id': '101',
      'x-test-user-role': 'GESTOR',
      'x-test-tenant-role': 'manager',
    });
    const secondResponse = await app.request('/historico/stats-extended', {
      'x-test-user-id': '202',
      'x-test-user-role': 'GESTOR',
      'x-test-tenant-role': 'manager',
    });

    const firstBody = (await firstResponse.json()) as { data: { total: number } };
    const secondBody = (await secondResponse.json()) as { data: { total: number } };

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.data.total).toBe(11);
    expect(secondBody.data.total).toBe(22);

    const statsQueries = calls.filter((call) => call.query.includes('COUNT(*) as total'));
    expect(statsQueries).toHaveLength(2);
    expect(histCacheMock.cache?.key).toContain('empresa:6');
    expect(histCacheMock.cache?.key).toContain('user:202');
    expect(histCacheMock.cache?.key).toContain('perfil:gestor');
    expect(histCacheMock.cache?.key).toContain('scope:restricted');
    expect(histCacheMock.cache?.key).toContain('scope-setores:9');
  });
});
