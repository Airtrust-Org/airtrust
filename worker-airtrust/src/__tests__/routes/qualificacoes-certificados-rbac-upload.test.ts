import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

const accessMock = vi.hoisted(() => vi.fn());
const assertFuncionarioInScopeMock = vi.hoisted(() => vi.fn());

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      c.set('userId', Number(c.req.header('x-test-user-id') || 10));
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 6));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

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
  extrairUsuarioAuditoria: () => ({ usuario_id: 10, origem: 'test' }),
}));

vi.mock('../../services/html-to-pdf', () => ({
  htmlToPdf: vi.fn(),
  processTemplateWithQR: vi.fn(),
}));

vi.mock('../../utils/qualificacoes-expiration', () => ({
  calcularDataVencimento: vi.fn(() => '2027-01-10'),
}));

vi.mock('../../services/employee-sector-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/employee-sector-access')>();
  return {
    ...actual,
    getEmployeeSectorAccess: accessMock,
    assertFuncionarioInScope: assertFuncionarioInScopeMock,
  };
});

import qualificacoesCertificadosRoutes from '../../routes/qualificacoes-certificados';

type FuncionarioRow = {
  id: number;
  empresa_id: number;
  setor_id: number;
  nome: string;
  cpf: string;
  deleted_at: string | null;
};

type HistoricoRow = {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  qualificacao_id: number;
  certificado_arquivo_id: number | null;
  numero_certificado: string | null;
  arquivo_url: string | null;
  data_conclusao: string | null;
  data_vencimento: string | null;
  deleted_at: string | null;
};

type DocumentoRow = {
  id: number;
  uuid: string;
  funcionario_id: number;
  empresa_id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  descricao: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type PastaVirtualRow = {
  id: number;
  funcionario_id: number;
  documento_id: number | null;
  certificacao_id: number | null;
  empresa_id: number;
  caminho_arquivo: string;
  nome_arquivo: string;
  deleted_at: string | null;
};

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/certificados', qualificacoesCertificadosRoutes);
  return app;
}

function createMockEnv() {
  const funcionarios: FuncionarioRow[] = [
    {
      id: 101,
      empresa_id: 6,
      setor_id: 10,
      nome: 'Tripulante Escopo',
      cpf: '12345678901',
      deleted_at: null,
    },
    {
      id: 102,
      empresa_id: 6,
      setor_id: 11,
      nome: 'Tripulante Fora',
      cpf: '10987654321',
      deleted_at: null,
    },
    {
      id: 201,
      empresa_id: 7,
      setor_id: 10,
      nome: 'Outro Tenant',
      cpf: '55555555555',
      deleted_at: null,
    },
  ];

  const historicos: HistoricoRow[] = [
    {
      id: 2001,
      funcionario_id: 101,
      empresa_id: 6,
      qualificacao_id: 301,
      certificado_arquivo_id: null,
      numero_certificado: null,
      arquivo_url: null,
      data_conclusao: '2026-01-10',
      data_vencimento: '2027-01-10',
      deleted_at: null,
    },
    {
      id: 2002,
      funcionario_id: 102,
      empresa_id: 6,
      qualificacao_id: 302,
      certificado_arquivo_id: null,
      numero_certificado: null,
      arquivo_url: null,
      data_conclusao: '2026-02-15',
      data_vencimento: '2027-02-15',
      deleted_at: null,
    },
    {
      id: 3001,
      funcionario_id: 201,
      empresa_id: 7,
      qualificacao_id: 303,
      certificado_arquivo_id: null,
      numero_certificado: null,
      arquivo_url: null,
      data_conclusao: '2026-03-20',
      data_vencimento: '2027-03-20',
      deleted_at: null,
    },
  ];

  const documentos: DocumentoRow[] = [
    {
      id: 5001,
      uuid: 'doc-5001',
      funcionario_id: 101,
      empresa_id: 6,
      nome_arquivo: 'CERT-ESCOPO.pdf',
      tipo: 'application/pdf',
      tamanho: 2048,
      r2_key: 'certificados/escopo.pdf',
      descricao: 'Certificado escopo',
      created_at: '2026-01-10T10:00:00.000Z',
      updated_at: '2026-01-10T10:00:00.000Z',
      deleted_at: null,
    },
    {
      id: 5002,
      uuid: 'doc-5002',
      funcionario_id: 102,
      empresa_id: 6,
      nome_arquivo: 'CERT-FORA.pdf',
      tipo: 'application/pdf',
      tamanho: 2048,
      r2_key: 'certificados/fora.pdf',
      descricao: 'Certificado fora do escopo',
      created_at: '2026-02-15T10:00:00.000Z',
      updated_at: '2026-02-15T10:00:00.000Z',
      deleted_at: null,
    },
  ];

  const pastaVirtual: PastaVirtualRow[] = [
    {
      id: 7001,
      funcionario_id: 101,
      documento_id: 5001,
      certificacao_id: 2001,
      empresa_id: 6,
      caminho_arquivo: 'certificados/escopo.pdf',
      nome_arquivo: 'CERT-ESCOPO.pdf',
      deleted_at: null,
    },
    {
      id: 7002,
      funcionario_id: 102,
      documento_id: 5002,
      certificacao_id: 2002,
      empresa_id: 6,
      caminho_arquivo: 'certificados/fora.pdf',
      nome_arquivo: 'CERT-FORA.pdf',
      deleted_at: null,
    },
  ];

  let nextDocumentoId = 9000;
  let nextPastaVirtualId = 9500;
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];

  const bucket = {
    get: vi.fn(),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  };

  function findFuncionario(id: number) {
    return funcionarios.find((row) => row.id === id && !row.deleted_at) || null;
  }

  function findHistorico(id: number) {
    return historicos.find((row) => row.id === id && !row.deleted_at) || null;
  }

  function findDocumento(id: number) {
    return documentos.find((row) => row.id === id && !row.deleted_at) || null;
  }

  const db = {
    prepare: vi.fn((query: string) => {
      const bind = (...args: unknown[]) => ({
        first: async () => {
          calls.push({ query, args, method: 'first' });

          if (query.includes('SELECT qh.id, qh.funcionario_id, f.empresa_id')) {
            const historico = findHistorico(Number(args[0]));
            const funcionario = historico ? findFuncionario(historico.funcionario_id) : null;
            if (!historico || !funcionario || funcionario.empresa_id !== Number(args[1])) {
              return null;
            }
            return {
              id: historico.id,
              funcionario_id: historico.funcionario_id,
              empresa_id: funcionario.empresa_id,
            };
          }

          if (query.includes('qt.nome as qualificacao_nome')) {
            const historico = findHistorico(Number(args[0]));
            const funcionario = historico ? findFuncionario(historico.funcionario_id) : null;
            if (!historico || !funcionario) {
              return null;
            }
            return {
              id: historico.id,
              funcionario_id: historico.funcionario_id,
              data_conclusao: historico.data_conclusao,
              data_vencimento: historico.data_vencimento,
              certificado_arquivo_id: historico.certificado_arquivo_id,
              qualificacao_nome: 'Qualificação',
              codigo: 'OPC',
              funcionario_cpf: funcionario.cpf,
              funcionario_nome: funcionario.nome,
            };
          }

          if (query.includes('SELECT r2_key FROM documentos WHERE id = ?')) {
            const documento = findDocumento(Number(args[0]));
            return documento ? { r2_key: documento.r2_key } : null;
          }

          if (
            query.includes('SELECT d.id') &&
            query.includes('FROM qualificacoes_historico qh') &&
            query.includes('INNER JOIN documentos d')
          ) {
            const empresaId = Number(args[0]);
            const historicoId = Number(args[1]);
            const historicoEmpresaId = Number(args[2]);
            const documentoId = Number(args[3]);
            const historico = findHistorico(historicoId);
            const documento = findDocumento(documentoId);
            const funcionario = historico ? findFuncionario(historico.funcionario_id) : null;

            if (
              !historico ||
              !documento ||
              !funcionario ||
              funcionario.empresa_id !== empresaId ||
              historico.empresa_id !== historicoEmpresaId ||
              historico.certificado_arquivo_id !== documentoId
            ) {
              return null;
            }

            return { id: documento.id };
          }

          return null;
        },
        all: async () => {
          calls.push({ query, args, method: 'all' });

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
              .filter((doc) => !doc.deleted_at && doc.empresa_id === empresaId)
              .filter((doc) => {
                const fromPastaVirtual = pastaVirtual.some(
                  (row) =>
                    !row.deleted_at &&
                    row.empresa_id === empresaId &&
                    row.certificacao_id === historicoId &&
                    row.funcionario_id === doc.funcionario_id &&
                    row.caminho_arquivo === doc.r2_key,
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
                      !row.deleted_at &&
                      row.empresa_id === empresaId &&
                      row.certificacao_id === historicoId &&
                      row.funcionario_id === doc.funcionario_id &&
                      row.caminho_arquivo === doc.r2_key,
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
          runs.push({ query, args });

          if (query.startsWith('INSERT INTO documentos')) {
            const documento: DocumentoRow = {
              id: ++nextDocumentoId,
              uuid: String(args[0]),
              funcionario_id: Number(args[1]),
              nome_arquivo: String(args[2]),
              tipo: String(args[3]),
              tamanho: Number(args[4]),
              r2_key: String(args[5]),
              descricao: String(args[6] || ''),
              empresa_id: Number(args[7]),
              created_at: '2026-06-17T12:00:00.000Z',
              updated_at: '2026-06-17T12:00:00.000Z',
              deleted_at: null,
            };
            documentos.push(documento);
            return { meta: { changes: 1, last_row_id: documento.id } };
          }

          if (query.startsWith('INSERT INTO pasta_virtual')) {
            pastaVirtual.push({
              id: ++nextPastaVirtualId,
              funcionario_id: Number(args[0]),
              documento_id: Number(args[1]),
              certificacao_id: Number(args[2]),
              empresa_id: Number(args[3]),
              caminho_arquivo: String(args[6]),
              nome_arquivo: String(args[7]),
              deleted_at: null,
            });
            return { meta: { changes: 1, last_row_id: nextPastaVirtualId } };
          }

          if (query.includes('UPDATE qualificacoes_historico') && query.includes('SET certificado_arquivo_id = ?')) {
            const historico = historicos.find(
              (row) =>
                row.id === Number(args[3]) &&
                row.empresa_id === Number(args[4]) &&
                row.deleted_at === null,
            );
            if (!historico) {
              return { meta: { changes: 0 } };
            }

            historico.certificado_arquivo_id = Number(args[0]);
            historico.arquivo_url = String(args[1]);
            historico.numero_certificado = String(args[2]);
            return { meta: { changes: 1 } };
          }

          if (query.startsWith('UPDATE documentos')) {
            const documento = documentos.find(
              (row) =>
                row.id === Number(args[0]) &&
                row.funcionario_id === Number(args[1]) &&
                row.deleted_at === null,
            );
            if (documento) {
              documento.deleted_at = '2026-06-17T12:30:00.000Z';
              documento.updated_at = '2026-06-17T12:30:00.000Z';
            }
            return { meta: { changes: documento ? 1 : 0 } };
          }

          if (query.startsWith('UPDATE pasta_virtual')) {
            for (const row of pastaVirtual) {
              if (
                row.funcionario_id === Number(args[0]) &&
                row.certificacao_id === Number(args[1]) &&
                ((query.includes('documento_id = ?') && row.documento_id === Number(args[2])) ||
                  (!query.includes('documento_id = ?') &&
                    row.caminho_arquivo === String(args[2]))) &&
                row.empresa_id === Number(args[3]) &&
                row.deleted_at === null
              ) {
                row.deleted_at = '2026-06-17T12:30:00.000Z';
              }
            }
            return { meta: { changes: 1 } };
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
                historico.arquivo_url = null;
                historico.numero_certificado = null;
                changes += 1;
              }
            }
            return { meta: { changes } };
          }

          return { meta: { changes: 1, last_row_id: 1 } };
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
    env: { DB: db, BUCKET: bucket } as unknown as Env,
    bucket,
    runs,
    calls,
    documentos,
    pastaVirtual,
    historicos,
  };
}

async function request(
  path: string,
  env: Env,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {},
) {
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', extraHeaders['x-test-empresa-id'] || '6');
  headers.set('x-test-role', extraHeaders['x-test-role'] || 'admin');
  headers.set('x-test-scope', extraHeaders['x-test-scope'] || 'admin');

  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }

  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

function createPdfFile() {
  const bytes = new Uint8Array(2048);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new File([bytes], 'certificado.pdf', { type: 'application/pdf' });
}

describe('qualificacoes certificados rbac e upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
        const allowedMap = new Map([
          [101, 10],
          [102, 11],
          [201, 10],
        ]);
        const setorId = allowedMap.get(funcionarioId);
        if (setorId && access.setorIds.includes(setorId)) {
          return;
        }
        throw {
          message: 'Acesso negado ao funcionário solicitado',
          status: 403,
          code: 'FUNCIONARIO_OUT_OF_SCOPE',
        };
      },
    );
  });

  it('admin continua vendo anexos do historico', async () => {
    const { env } = createMockEnv();

    const response = await request('/api/certificados/historico/2002/certificados', env);
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([5002]);
    expect(body.data[0]).toMatchObject({
      id: 5002,
      documento_id: 5002,
      pasta_virtual_id: 7002,
      historico_id: 2002,
    });
  });

  it('gestor setorial autorizado lista anexos do proprio historico', async () => {
    const { env } = createMockEnv();

    const response = await request(
      '/api/certificados/historico/2001/certificados',
      env,
      {},
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.map((row) => row.id)).toEqual([5001]);
  });

  it('gestor fora do escopo recebe 403 ao listar anexos', async () => {
    const { env } = createMockEnv();

    const response = await request(
      '/api/certificados/historico/2002/certificados',
      env,
      {},
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      error: string;
      code?: string;
    };

    expect(response.status).toBe(403);
    expect(body.error).toBe('Acesso negado ao funcionário solicitado');
    expect(body.code).toBe('FUNCIONARIO_OUT_OF_SCOPE');
  });

  it('upload do gestor autorizado cria documento, pasta_virtual e vínculo principal visível', async () => {
    const { env, bucket, documentos, pastaVirtual, historicos, runs } = createMockEnv();
    const form = new FormData();
    form.set('file', createPdfFile());
    form.set('descricao', 'Certificado anexado no teste');

    const response = await request(
      '/api/certificados/historico/2001/certificados/upload',
      env,
      {
        method: 'POST',
        body: form,
      },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      data: { id: number };
    };

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(bucket.put).toHaveBeenCalledTimes(1);

    const historico = historicos.find((row) => row.id === 2001);
    expect(historico?.certificado_arquivo_id).toBe(body.data.id);
    expect(documentos.some((row) => row.id === body.data.id && row.empresa_id === 6)).toBe(true);
    expect(
      pastaVirtual.some(
        (row) => row.documento_id === body.data.id && row.certificacao_id === 2001 && row.empresa_id === 6,
      ),
    ).toBe(true);

    const updateQuery = runs.find((run) =>
      run.query.includes('UPDATE qualificacoes_historico') &&
      run.query.includes('SET certificado_arquivo_id = ?'),
    )?.query;
    expect(updateQuery).toContain('empresa_id = ?');
    expect(updateQuery).toContain('deleted_at IS NULL');

    const listResponse = await request(
      '/api/certificados/historico/2001/certificados',
      env,
      {},
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );
    const listBody = (await listResponse.json()) as {
      success: boolean;
      data: Array<{ id: number }>;
    };

    expect(listResponse.status).toBe(200);
    expect(listBody.success).toBe(true);
    expect(listBody.data.some((row) => row.id === body.data.id)).toBe(true);
  });

  it('upload fora do escopo retorna 403 sem gravar no R2', async () => {
    const { env, bucket, documentos } = createMockEnv();
    const form = new FormData();
    form.set('file', createPdfFile());

    const response = await request(
      '/api/certificados/historico/2002/certificados/upload',
      env,
      {
        method: 'POST',
        body: form,
      },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );

    expect(response.status).toBe(403);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(documentos).toHaveLength(2);
  });

  it('historico inexistente no tenant retorna 404 sem upload', async () => {
    const { env, bucket, documentos } = createMockEnv();
    const form = new FormData();
    form.set('file', createPdfFile());

    const response = await request(
      '/api/certificados/historico/3001/certificados/upload',
      env,
      {
        method: 'POST',
        body: form,
      },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );

    expect(response.status).toBe(404);
    expect(bucket.put).not.toHaveBeenCalled();
    expect(documentos).toHaveLength(2);
  });

  it('admin exclui anexo via id retornado pela listagem quando certificado_arquivo_id esta NULL', async () => {
    const { env, bucket, documentos, pastaVirtual, historicos } = createMockEnv();

    const listResponse = await request('/api/certificados/historico/2001/certificados', env);
    const listBody = (await listResponse.json()) as {
      success: boolean;
      data: Array<{ id: number; documento_id: number }>;
    };

    const cert = listBody.data[0];
    const deleteResponse = await request(
      `/api/certificados/historico/2001/certificados/${cert.id}`,
      env,
      { method: 'DELETE' },
    );

    expect(deleteResponse.status).toBe(200);
    expect(documentos.find((row) => row.id === cert.documento_id)?.deleted_at).not.toBeNull();
    expect(
      pastaVirtual.find((row) => row.documento_id === cert.documento_id && row.certificacao_id === 2001)
        ?.deleted_at,
    ).not.toBeNull();
    expect(historicos.find((row) => row.id === 2001)?.certificado_arquivo_id).toBeNull();
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();

    const afterList = await request('/api/certificados/historico/2001/certificados', env);
    const afterBody = (await afterList.json()) as { data: Array<{ id: number }> };
    expect(afterBody.data).toEqual([]);
  });

  it('gestor autorizado exclui anexo dentro do setor', async () => {
    const { env, documentos } = createMockEnv();

    const response = await request(
      '/api/certificados/historico/2001/certificados/5001',
      env,
      { method: 'DELETE' },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );

    expect(response.status).toBe(200);
    expect(documentos.find((row) => row.id === 5001)?.deleted_at).not.toBeNull();
  });

  it('gestor fora do escopo nao exclui anexo', async () => {
    const { env, documentos } = createMockEnv();

    const response = await request(
      '/api/certificados/historico/2002/certificados/5002',
      env,
      { method: 'DELETE' },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-tripulacao',
      },
    );

    expect(response.status).toBe(403);
    expect(documentos.find((row) => row.id === 5002)?.deleted_at).toBeNull();
  });

  it('escopo vazio fail-closed no delete', async () => {
    const { env, documentos } = createMockEnv();

    const response = await request(
      '/api/certificados/historico/2001/certificados/5001',
      env,
      { method: 'DELETE' },
      {
        'x-test-role': 'manager',
        'x-test-scope': 'manager-empty',
      },
    );

    expect(response.status).toBe(403);
    expect(documentos.find((row) => row.id === 5001)?.deleted_at).toBeNull();
  });

  it('delete de anexo de outro historico retorna 404 seguro', async () => {
    const { env, documentos } = createMockEnv();

    const response = await request('/api/certificados/historico/2001/certificados/5002', env, {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(documentos.find((row) => row.id === 5002)?.deleted_at).toBeNull();
  });

  it('excluir um anexo preserva os demais quando ha multiplos documentos no historico', async () => {
    const { env, documentos, pastaVirtual } = createMockEnv();

    documentos.push({
      id: 5003,
      uuid: 'doc-5003',
      funcionario_id: 101,
      empresa_id: 6,
      nome_arquivo: 'CERT-ESCOPO-2.pdf',
      tipo: 'application/pdf',
      tamanho: 1024,
      r2_key: 'certificados/escopo-2.pdf',
      descricao: 'Certificado escopo 2',
      created_at: '2026-01-11T10:00:00.000Z',
      updated_at: '2026-01-11T10:00:00.000Z',
      deleted_at: null,
    });
    pastaVirtual.push({
      id: 7003,
      funcionario_id: 101,
      documento_id: 5003,
      certificacao_id: 2001,
      empresa_id: 6,
      caminho_arquivo: 'certificados/escopo-2.pdf',
      nome_arquivo: 'CERT-ESCOPO-2.pdf',
      deleted_at: null,
    });

    const response = await request('/api/certificados/historico/2001/certificados/5001', env, {
      method: 'DELETE',
    });
    expect(response.status).toBe(200);

    const listResponse = await request('/api/certificados/historico/2001/certificados', env);
    const listBody = (await listResponse.json()) as { data: Array<{ id: number }> };
    expect(listBody.data.map((row) => row.id)).toEqual([5003]);
  });
});
