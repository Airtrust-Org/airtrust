import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const accessMock = vi.hoisted(() => vi.fn());

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
  getTenantContext: (c: any) => ({
    empresaId: Number(c.req.header('x-test-empresa-id') || 6),
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

vi.mock('../../services/employee-sector-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/employee-sector-access')>();
  return {
    ...actual,
    getEmployeeSectorAccess: accessMock,
  };
});

import historicoRouter from '../../routes/qualificacoes/historico';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/historico', historicoRouter);
  return {
    request: (path: string, headers?: HeadersInit) =>
      app.request(path, { headers }, { DB: db } as Env),
  };
}

function createMockDb() {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];

  const rows = [
    {
      id: 501,
      funcionario_id: 101,
      setor_id: 10,
      funcionario_nome: 'Tripulante A',
      tipo_id: 20,
      tipo_nome: 'CRM',
      tipo_codigo: 'CRM',
      validade_meses: 12,
      data_realizacao: '2026-01-15',
      data_vencimento: '2027-01-15',
      renovada: 0,
      tem_renovacao_posterior: 0,
      renovacao_de: null,
      qualificacao_status: 'CONCLUIDA',
      certificado_arquivo_id: 9001,
      tem_certificado: 1,
      certificado_url: '/api/pasta-virtual/stream/9001',
    },
    {
      id: 502,
      funcionario_id: 102,
      setor_id: 10,
      funcionario_nome: 'Tripulante B',
      tipo_id: 21,
      tipo_nome: 'OPC',
      tipo_codigo: 'OPC',
      validade_meses: 12,
      data_realizacao: '2026-02-10',
      data_vencimento: '2027-02-10',
      renovada: 0,
      tem_renovacao_posterior: 0,
      renovacao_de: null,
      qualificacao_status: 'CONCLUIDA',
      certificado_arquivo_id: null,
      tem_certificado: 1,
      certificado_url: '/api/pasta-virtual/stream/9102',
    },
    {
      id: 503,
      funcionario_id: 103,
      setor_id: 11,
      funcionario_nome: 'Tripulante C',
      tipo_id: 22,
      tipo_nome: 'IFR',
      tipo_codigo: 'IFR',
      validade_meses: 12,
      data_realizacao: '2026-03-05',
      data_vencimento: '2027-03-05',
      renovada: 0,
      tem_renovacao_posterior: 0,
      renovacao_de: null,
      qualificacao_status: 'CONCLUIDA',
      certificado_arquivo_id: null,
      tem_certificado: 1,
      certificado_url: '/api/pasta-virtual/stream/9103',
    },
  ];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('COUNT(*) as total')) {
            return {
              total: 3,
              validas: 3,
              vencendo: 0,
              vencidas: 0,
              renovadas: 0,
              planejadas: 0,
            };
          }

          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });

          if (query.includes('PRAGMA table_info(qualificacoes_historico)')) {
            return { results: [{ name: 'renovacao_de' }] };
          }

          if (query.includes('PRAGMA table_info(pasta_virtual)')) {
            return {
              results: [{ name: 'documento_id' }, { name: 'certificacao_id' }, { name: 'empresa_id' }],
            };
          }

          if (query.includes('PRAGMA table_info(documentos)')) {
            return {
              results: [{ name: 'empresa_id' }],
            };
          }

          if (query.includes('LIMIT ? OFFSET ?')) {
            if (query.includes('1 = 0')) {
              return { results: [] };
            }

            const scopedRows = query.includes('f.setor_id IN (?)')
              ? rows.filter((row) => row.setor_id === Number(args.find((value) => Number(value) === 10) || 0))
              : rows;

            return { results: scopedRows };
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

describe('qualificacoes historico certificado fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    histCacheMock.cache = null;
    histCacheMock.inflight.clear();
    ensureHistoricoSchemaMock.mockResolvedValue(undefined);
    ensureModelosAeronaveModeloColumnMock.mockResolvedValue(undefined);
    accessMock.mockImplementation(async (c: any) => {
      const scope = c.req.header('x-test-scope') || 'admin';
      if (scope === 'manager-tripulacao') {
        return { mode: 'restricted', setorIds: [10], funcionarioId: null };
      }
      if (scope === 'manager-empty') {
        return { mode: 'restricted', setorIds: [], funcionarioId: null };
      }
      return { mode: 'all', setorIds: [], funcionarioId: null };
    });
  });

  it('marca tem_certificado quando apenas pasta_virtual tem o anexo', async () => {
    const { db, calls } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico', { 'x-test-empresa-id': '6' });
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number; tem_certificado: number; certificado_url: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.find((row) => row.id === 502)).toMatchObject({
      tem_certificado: 1,
      certificado_url: '/api/pasta-virtual/stream/9102',
    });

    const dataQuery = calls.find(
      (call) => call.method === 'all' && call.query.includes('LIMIT ? OFFSET ?'),
    )?.query;
    expect(dataQuery).toContain('pv_cert.certificacao_id = qh.id');
    expect(dataQuery).toContain('pv_cert.empresa_id = f.empresa_id');
  });

  it('mantem gestor setorial vendo apenas o proprio escopo com fallback ativo', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico', {
      'x-test-empresa-id': '6',
      'x-test-scope': 'manager-tripulacao',
    });
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([501, 502]);
  });

  it('fail closed quando o gestor nao possui setores atribuídos', async () => {
    const { db } = createMockDb();
    const app = createApp(db);

    const response = await app.request('/historico', {
      'x-test-empresa-id': '6',
      'x-test-scope': 'manager-empty',
    });
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});
