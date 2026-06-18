import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const accessMock = vi.hoisted(() => vi.fn());
const assertFuncionarioInScopeMock = vi.hoisted(() => vi.fn());

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
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
    c.set('userRole', c.req.header('x-test-role') || 'admin');
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.req.header('x-test-empresa-id') || 6),
  }),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || c.req.header('x-test-empresa-id') || 0),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (...requiredRoles: string[]) =>
    async (c: any, next: () => Promise<void>) => {
      const role = String(c.get('userRole') || '').toLowerCase();
      if (!requiredRoles.map((item) => item.toLowerCase()).includes(role)) {
        return c.json({ success: false, error: 'Permissão negada' }, 403);
      }
      await next();
    },
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, origem: 'test' }),
}));

vi.mock('../../services/html-to-pdf', () => ({
  htmlToPdf: vi.fn(),
  processTemplateWithQR: vi.fn(),
}));

vi.mock('../../utils/qualificacoes-expiration', () => ({
  calcularDataVencimento: vi.fn(() => '2027-01-01'),
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
    assertFuncionarioInScope: assertFuncionarioInScopeMock,
  };
});

import historicoRouter from '../../routes/qualificacoes/historico';
import qualificacoesCertificadosRoutes from '../../routes/qualificacoes-certificados';

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/historico', historicoRouter);
  return {
    request: (path: string, headers?: HeadersInit) =>
      app.request(path, { headers }, { DB: db } as Env),
  };
}

function createIntegratedApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/qualificacoes/historico', historicoRouter);
  app.route('/api/certificados', qualificacoesCertificadosRoutes);
  return {
    request: (path: string, init?: RequestInit, headers?: HeadersInit) => {
      const requestHeaders = new Headers(headers);
      requestHeaders.set('x-test-empresa-id', String(requestHeaders.get('x-test-empresa-id') || '6'));
      requestHeaders.set('x-test-role', String(requestHeaders.get('x-test-role') || 'admin'));
      return app.fetch(
        new Request(`http://localhost${path}`, { ...init, headers: requestHeaders }),
        env,
        {} as ExecutionContext,
      );
    },
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

function createDeleteRegressionEnv() {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];
  const historicos = [
    {
      id: 502,
      funcionario_id: 102,
      empresa_id: 6,
      setor_id: 10,
      tipo_codigo: 'OPC',
      certificado_arquivo_id: null as number | null,
      deleted_at: null as string | null,
    },
  ];
  const documentos = [
    {
      id: 9102,
      uuid: 'doc-9102',
      funcionario_id: 102,
      empresa_id: 6,
      nome_arquivo: 'CERT-FALLBACK-1.pdf',
      tipo: 'application/pdf',
      tamanho: 2048,
      r2_key: 'certificados/fallback-1.pdf',
      created_at: '2026-02-10T10:00:00.000Z',
      updated_at: '2026-02-10T10:00:00.000Z',
      deleted_at: null as string | null,
    },
    {
      id: 9103,
      uuid: 'doc-9103',
      funcionario_id: 102,
      empresa_id: 6,
      nome_arquivo: 'CERT-FALLBACK-2.pdf',
      tipo: 'application/pdf',
      tamanho: 2048,
      r2_key: 'certificados/fallback-2.pdf',
      created_at: '2026-02-11T10:00:00.000Z',
      updated_at: '2026-02-11T10:00:00.000Z',
      deleted_at: null as string | null,
    },
  ];
  const pastaVirtual = [
    {
      id: 8102,
      funcionario_id: 102,
      documento_id: 9102,
      certificacao_id: 502,
      empresa_id: 6,
      caminho_arquivo: 'certificados/fallback-1.pdf',
      nome_arquivo: 'CERT-FALLBACK-1.pdf',
      deleted_at: null as string | null,
    },
    {
      id: 8103,
      funcionario_id: 102,
      documento_id: 9103,
      certificacao_id: 502,
      empresa_id: 6,
      caminho_arquivo: 'certificados/fallback-2.pdf',
      nome_arquivo: 'CERT-FALLBACK-2.pdf',
      deleted_at: null as string | null,
    },
  ];

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('COUNT(*) as total')) {
            const hasAny = pastaVirtual.some(
              (row) => row.certificacao_id === 502 && row.empresa_id === 6 && row.deleted_at === null,
            );
            return {
              total: 1,
              validas: 1,
              vencendo: 0,
              vencidas: 0,
              renovadas: 0,
              planejadas: 0,
            };
          }

          if (query.includes('SELECT qh.id, qh.funcionario_id, f.empresa_id')) {
            const historico = historicos.find(
              (row) => row.id === Number(args[0]) && row.empresa_id === Number(args[1]) && row.deleted_at === null,
            );
            return historico
              ? {
                  id: historico.id,
                  funcionario_id: historico.funcionario_id,
                  empresa_id: historico.empresa_id,
                }
              : null;
          }

          if (query.includes('qt.nome as qualificacao_nome')) {
            const historico = historicos.find(
              (row) => row.id === Number(args[0]) && row.deleted_at === null,
            );
            return historico
              ? {
                  id: historico.id,
                  funcionario_id: historico.funcionario_id,
                  data_conclusao: '2026-02-10',
                  data_vencimento: '2027-02-10',
                  certificado_arquivo_id: historico.certificado_arquivo_id,
                  qualificacao_nome: 'OPC',
                  codigo: historico.tipo_codigo,
                  funcionario_cpf: '123',
                  funcionario_nome: 'Tripulante B',
                }
              : null;
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
            return { results: [{ name: 'empresa_id' }] };
          }

          if (query.includes('LIMIT ? OFFSET ?')) {
            const hasAny = pastaVirtual.some(
              (row) => row.certificacao_id === 502 && row.empresa_id === 6 && row.deleted_at === null,
            );
            return {
              results: [
                {
                  id: 502,
                  funcionario_id: 102,
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
                  tem_certificado: hasAny ? 1 : 0,
                  certificado_url: hasAny ? '/api/pasta-virtual/stream/9102' : null,
                },
              ],
            };
          }

          if (
            query.includes('FROM documentos d') &&
            query.includes('GROUP BY') &&
            query.includes('AS documento_id')
          ) {
            const historicoId = Number(args[0]);
            const empresaId = Number(args[1]);
            const funcionarioId = Number(args[args.length - 2]);
            const documentoPrincipalId = Number(args[args.length - 1]);
            const results = documentos
              .filter((doc) => doc.deleted_at === null && doc.empresa_id === empresaId)
              .filter((doc) => {
                const fromPastaVirtual = pastaVirtual.some(
                  (row) =>
                    row.deleted_at === null &&
                    row.empresa_id === empresaId &&
                    row.certificacao_id === historicoId &&
                    row.funcionario_id === doc.funcionario_id &&
                    (row.documento_id === doc.id || row.caminho_arquivo === doc.r2_key),
                );
                const fromMainLink = doc.funcionario_id === funcionarioId && doc.id === documentoPrincipalId;
                return fromPastaVirtual || fromMainLink;
              })
              .sort((a, b) => b.id - a.id)
              .map((doc) => ({
                id: doc.id,
                documento_id: doc.id,
                pasta_virtual_id:
                  pastaVirtual.find(
                    (row) =>
                      row.deleted_at === null &&
                      row.empresa_id === empresaId &&
                      row.certificacao_id === historicoId &&
                      row.documento_id === doc.id,
                  )?.id ?? null,
                historico_id: historicoId,
                uuid: doc.uuid,
                funcionario_id: doc.funcionario_id,
                nome_arquivo: doc.nome_arquivo,
                tipo: doc.tipo,
                tamanho: doc.tamanho,
                r2_key: doc.r2_key,
                created_at: doc.created_at,
                updated_at: doc.updated_at,
                numero_certificado: doc.nome_arquivo.replace('.pdf', ''),
              }));
            return { results };
          }

          return { results: [] };
        },
        run: async () => {
          calls.push({ query, args, method: 'run' });

          if (query.startsWith('UPDATE documentos')) {
            const documento = documentos.find(
              (row) =>
                row.id === Number(args[0]) &&
                row.funcionario_id === Number(args[1]) &&
                row.deleted_at === null,
            );
            if (documento) {
              documento.deleted_at = '2026-06-18T00:30:00.000Z';
              documento.updated_at = '2026-06-18T00:30:00.000Z';
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }

          if (query.startsWith('UPDATE pasta_virtual')) {
            let changes = 0;
            for (const row of pastaVirtual) {
              if (
                row.funcionario_id === Number(args[0]) &&
                row.certificacao_id === Number(args[1]) &&
                ((query.includes('documento_id = ?') && row.documento_id === Number(args[2])) ||
                  (!query.includes('documento_id = ?') && row.caminho_arquivo === String(args[2]))) &&
                row.empresa_id === Number(args[3]) &&
                row.deleted_at === null
              ) {
                row.deleted_at = '2026-06-18T00:30:00.000Z';
                changes += 1;
              }
            }
            return { meta: { changes } };
          }

          if (
            query.includes('UPDATE qualificacoes_historico') &&
            query.includes('SET certificado_arquivo_id = NULL')
          ) {
            let changes = 0;
            for (const historico of historicos) {
              if (
                historico.certificado_arquivo_id === Number(args[0]) &&
                historico.empresa_id === Number(args[1]) &&
                historico.deleted_at === null
              ) {
                historico.certificado_arquivo_id = null;
                changes += 1;
              }
            }
            return { meta: { changes } };
          }

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

  return {
    env: { DB: db } as Env,
    calls,
  };
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
    assertFuncionarioInScopeMock.mockImplementation(
      async (_db: D1Database, _empresaId: number, funcionarioId: number, access: any) => {
        if (access.mode === 'all') return;
        if (access.setorIds.includes(10) && funcionarioId === 102) return;
        throw {
          message: 'Acesso negado ao funcionário solicitado',
          status: 403,
          code: 'FUNCIONARIO_OUT_OF_SCOPE',
        };
      },
    );
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

  it('remove o ultimo anexo fallback-only e o historico deixa de indicar certificado', async () => {
    const { env } = createDeleteRegressionEnv();
    const app = createIntegratedApp(env);

    const beforeHistorico = await app.request('/api/qualificacoes/historico', undefined, {
      'x-test-empresa-id': '6',
    });
    const beforeHistoricoBody = (await beforeHistorico.json()) as {
      data: Array<{ id: number; tem_certificado: number }>;
    };
    expect(beforeHistoricoBody.data.find((row) => row.id === 502)?.tem_certificado).toBe(1);

    const listResponse = await app.request('/api/certificados/historico/502/certificados', undefined, {
      'x-test-empresa-id': '6',
    });
    const listBody = (await listResponse.json()) as {
      data: Array<{ id: number; documento_id: number }>;
    };
    expect(listBody.data).toHaveLength(2);

    const documentoId = listBody.data.find((item) => item.documento_id === 9102)?.documento_id;
    expect(documentoId).toBe(9102);

    const deleteResponse = await app.request(
      `/api/certificados/historico/502/certificados/${documentoId}`,
      { method: 'DELETE' },
      {
        'x-test-empresa-id': '6',
      },
    );
    expect(deleteResponse.status).toBe(200);

    const afterList = await app.request('/api/certificados/historico/502/certificados', undefined, {
      'x-test-empresa-id': '6',
    });
    const afterListBody = (await afterList.json()) as {
      data: Array<{ id: number; documento_id: number }>;
    };
    expect(afterListBody.data.map((item) => item.documento_id)).toEqual([9103]);

    const afterHistorico = await app.request('/api/qualificacoes/historico', undefined, {
      'x-test-empresa-id': '6',
    });
    const afterHistoricoBody = (await afterHistorico.json()) as {
      data: Array<{ id: number; tem_certificado: number }>;
    };
    expect(afterHistoricoBody.data.find((row) => row.id === 502)?.tem_certificado).toBe(1);

    const deleteLastResponse = await app.request(
      '/api/certificados/historico/502/certificados/9103',
      { method: 'DELETE' },
      {
        'x-test-empresa-id': '6',
      },
    );
    expect(deleteLastResponse.status).toBe(200);

    const finalList = await app.request('/api/certificados/historico/502/certificados', undefined, {
      'x-test-empresa-id': '6',
    });
    const finalListBody = (await finalList.json()) as {
      data: Array<{ id: number; documento_id: number }>;
    };
    expect(finalListBody.data).toEqual([]);

    const finalHistorico = await app.request('/api/qualificacoes/historico', undefined, {
      'x-test-empresa-id': '6',
    });
    const finalHistoricoBody = (await finalHistorico.json()) as {
      data: Array<{ id: number; tem_certificado: number; certificado_url: string | null }>;
    };
    expect(finalHistoricoBody.data.find((row) => row.id === 502)).toMatchObject({
      tem_certificado: 0,
      certificado_url: null,
    });
  });
});
