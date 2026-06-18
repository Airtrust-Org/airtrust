import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { errorHandler } from '../../middleware/error-handler';

vi.mock('../../middleware/auth', () => ({
  auth:
    () =>
    async (c: any, next: () => Promise<void>) => {
      if (!c.req.header('Authorization')) {
        return c.json({ success: false, error: 'Token de autenticação não fornecido' }, 401);
      }

      c.set('userId', 10);
      c.set('empresaId', Number(c.req.header('x-test-empresa-id') || 0));
      c.set('userRole', c.req.header('x-test-role') || 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/tenant')>();
  return {
    ...actual,
    getTenantContext: (c: any) => ({
      empresaId: Number(c.get('empresaId') || 0),
      empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
      empresaNome: 'Empresa Teste',
      role: 'admin',
      plano: 'pro',
      permissions: ['read', 'write'],
    }),
    getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
  };
});

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    (requiredRole: string) =>
    async (c: any, next: () => Promise<void>) => {
      if ((c.get('userRole') || '').toLowerCase() !== String(requiredRole).toLowerCase()) {
        return c.json(
          { success: false, error: 'Permissão negada. Acesso restrito a: admin' },
          403,
        );
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
  calcularDataVencimento: vi.fn(() => '2027-01-01'),
}));

vi.mock('../../shared/domainEvents', () => ({
  publishDomainEvent: vi.fn(),
}));

import pastaVirtualRoutes from '../../routes/pasta-virtual';
import qualificacoesCertificadosRoutes from '../../routes/qualificacoes-certificados';
import qualificacoesCertificadosAdminRoutes from '../../routes/qualificacoes-certificados-admin';

type DocumentRow = {
  id: number;
  funcionario_id: number;
  empresa_id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  deleted_at: string | null;
};

type HistoricoRow = {
  id: number;
  funcionario_id: number;
  certificado_arquivo_id: number | null;
  empresa_id: number;
  codigo: string;
  deleted_at: string | null;
};

function createR2Object(body: string, contentType = 'application/pdf') {
  const blob = new Blob([body], { type: contentType });
  return {
    body: blob.stream(),
    arrayBuffer: () => blob.arrayBuffer(),
    httpMetadata: { contentType },
    customMetadata: {},
  } as unknown as R2ObjectBody;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/pasta-virtual', pastaVirtualRoutes);
  app.route('/api/certificados', qualificacoesCertificadosRoutes);
  app.route('/api/certificados', qualificacoesCertificadosAdminRoutes);
  return app;
}

function createMockEnv() {
  const docs: DocumentRow[] = [
    {
      id: 101,
      funcionario_id: 11,
      empresa_id: 1,
      nome_arquivo: 'CERT-TENANT-A.pdf',
      tipo: 'application/pdf',
      tamanho: 7,
      r2_key: 'certificados/a.pdf',
      deleted_at: null,
    },
    {
      id: 303,
      funcionario_id: 11,
      empresa_id: 1,
      nome_arquivo: 'CERT-PILOTO-X1-20260101.pdf',
      tipo: 'application/pdf',
      tamanho: 7,
      r2_key: 'certificados/orfao-a.pdf',
      deleted_at: null,
    },
    {
      id: 202,
      funcionario_id: 22,
      empresa_id: 2,
      nome_arquivo: 'CERT-TENANT-B.pdf',
      tipo: 'application/pdf',
      tamanho: 7,
      r2_key: 'certificados/b.pdf',
      deleted_at: null,
    },
    {
      id: 404,
      funcionario_id: 22,
      empresa_id: 2,
      nome_arquivo: 'CERT-PILOTO-X1-20260101.pdf',
      tipo: 'application/pdf',
      tamanho: 7,
      r2_key: 'certificados/orfao-b.pdf',
      deleted_at: null,
    },
  ];

  const historicos: HistoricoRow[] = [
    {
      id: 501,
      funcionario_id: 11,
      certificado_arquivo_id: 101,
      empresa_id: 1,
      codigo: 'CERT',
      deleted_at: null,
    },
    {
      id: 502,
      funcionario_id: 22,
      certificado_arquivo_id: 202,
      empresa_id: 2,
      codigo: 'CERT',
      deleted_at: null,
    },
    {
      id: 601,
      funcionario_id: 11,
      certificado_arquivo_id: null,
      empresa_id: 1,
      codigo: 'X1',
      deleted_at: null,
    },
    {
      id: 602,
      funcionario_id: 22,
      certificado_arquivo_id: null,
      empresa_id: 2,
      codigo: 'X1',
      deleted_at: null,
    },
    {
      id: 701,
      funcionario_id: 11,
      certificado_arquivo_id: 202,
      empresa_id: 1,
      codigo: 'CERT',
      deleted_at: null,
    },
  ];

  const bucket = {
    get: vi.fn(async () => createR2Object('pdf-body')),
    put: vi.fn(),
    delete: vi.fn(),
  };
  const runs: Array<{ query: string; args: unknown[] }> = [];
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' | 'run' }> = [];

  const findScopedDocument = (id: number, empresaId: number) =>
    docs.find((doc) => doc.id === id && doc.empresa_id === empresaId && !doc.deleted_at) || null;

  const findScopedDocumentsByFuncionario = (funcionarioId: number, empresaId: number) =>
    docs.filter(
      (doc) => doc.funcionario_id === funcionarioId && doc.empresa_id === empresaId && !doc.deleted_at,
    );

  const db = {
    prepare: vi.fn((query: string) => {
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });

        if (query.includes('PRAGMA table_info')) {
          return null;
        }

        if (query.includes('SELECT qh.id, qh.funcionario_id, f.empresa_id')) {
          const historicoId = Number(args[0]);
          const empresaId = Number(args[1]);
          const historico = historicos.find((row) => row.id === historicoId && !row.deleted_at);
          return historico && historico.empresa_id === empresaId
            ? {
                id: historico.id,
                funcionario_id: historico.funcionario_id,
                empresa_id: historico.empresa_id,
              }
            : null;
        }

        if (query.includes('qt.nome as qualificacao_nome')) {
          const historicoId = Number(args[0]);
          const historico = historicos.find((row) => row.id === historicoId && !row.deleted_at);

          if (!historico) return null;
          return {
            id: historico.id,
            funcionario_id: historico.funcionario_id,
            data_conclusao: '2026-01-01',
            data_vencimento: '2027-01-01',
            certificado_arquivo_id: historico.certificado_arquivo_id,
            qualificacao_nome: 'Qualificacao',
            codigo: historico.codigo,
            funcionario_cpf: '123',
            funcionario_nome: 'Tripulante',
          };
        }

        if (query.includes('SELECT f.empresa_id FROM qualificacoes_historico qh')) {
          const historicoId = Number(args[0]);
          const historico = historicos.find((row) => row.id === historicoId && !row.deleted_at);
          return historico ? { empresa_id: historico.empresa_id } : null;
        }

        if (query.includes('LEFT JOIN qualificacoes_historico qh')) {
          const historicoId = Number(args[0]);
          const certId = Number(args[1]);
          const empresaId = Number(args[2]);
          const doc = findScopedDocument(certId, empresaId);
          const historico = historicos.find(
            (row) => row.id === historicoId && !row.deleted_at,
          );

          if (!doc) return null;
          if (historico && historico.funcionario_id !== doc.funcionario_id) return null;
          if (historico && historico.certificado_arquivo_id !== doc.id) return null;
          return doc;
        }

        if (query.includes('FROM documentos d') && query.includes('WHERE d.id = ?')) {
          return findScopedDocument(Number(args[0]), Number(args[1]));
        }

        if (query.includes('FROM pasta_virtual pv')) {
          return null;
        }

        if (query.includes('FROM funcionarios')) {
          const funcionarioId = Number(args[0]);
          const empresaId = Number(args[1]);
          const doc = docs.find(
            (row) => row.funcionario_id === funcionarioId && row.empresa_id === empresaId,
          );
          return doc ? { id: funcionarioId, nome: 'Tripulante', matricula: 'M1', cpf: '123' } : null;
        }

        return null;
      };

      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });

        if (query.includes('PRAGMA table_info')) {
          return { results: [] };
        }

        if (query.includes('FROM documentos d') && query.includes('qh_link.certificado_arquivo_id')) {
          const empresaId = Number(args[0]);
          return {
            results: docs
              .filter((doc) => doc.empresa_id === empresaId && !doc.deleted_at)
              .filter((doc) => doc.nome_arquivo.startsWith('CERT-'))
              .filter(
                (doc) =>
                  !historicos.some(
                    (historico) =>
                      historico.certificado_arquivo_id === doc.id && !historico.deleted_at,
                  ),
              )
              .map((doc) => ({
                documento_id: doc.id,
                nome_arquivo: doc.nome_arquivo,
                funcionario_id: doc.funcionario_id,
                documento_data: '2026-01-01',
                r2_key: doc.r2_key,
              })),
          };
        }

        if (query.includes('FROM qualificacoes_historico qh') && query.includes('qh.codigo = ?')) {
          const funcionarioId = Number(args[0]);
          const codigo = String(args[1]);
          const empresaId = Number(args[2]);
          return {
            results: historicos
              .filter(
                (historico) =>
                  historico.funcionario_id === funcionarioId &&
                  historico.codigo === codigo &&
                  historico.empresa_id === empresaId &&
                  historico.certificado_arquivo_id === null &&
                  !historico.deleted_at,
              )
              .map((historico) => ({ id: historico.id, data_conclusao: '2026-01-01' })),
          };
        }

        if (query.includes('qh.id as historico_id')) {
          const empresaId = Number(args[0]);
          return {
            results: historicos
              .filter(
                (historico) =>
                  historico.empresa_id === empresaId &&
                  historico.certificado_arquivo_id !== null &&
                  !historico.deleted_at,
              )
              .filter((historico) => {
                const doc = docs.find((row) => row.id === historico.certificado_arquivo_id);
                return !doc || doc.deleted_at || doc.empresa_id !== historico.empresa_id;
              })
              .map((historico) => ({
                historico_id: historico.id,
                funcionario_id: historico.funcionario_id,
                codigo: historico.codigo,
                certificado_arquivo_id: historico.certificado_arquivo_id,
              })),
          };
        }

        if (
          query.includes('FROM documentos d') &&
          query.includes('JOIN funcionarios fd') &&
          query.includes('d.id = ?')
        ) {
          const empresaId = Number(args[0]);
          const certId = Number(args[1]);
          const doc = findScopedDocument(certId, empresaId);
          return { results: doc ? [doc] : [] };
        }

        if (query.includes('FROM qualificacoes_historico qh')) {
          const empresaId = Number(args[0]);
          const ids = args.slice(1).map(Number);
          return {
            results: historicos
              .filter((historico) => !historico.deleted_at)
              .filter((historico) => historico.certificado_arquivo_id !== null)
              .filter((historico) => ids.length === 0 || ids.includes(historico.id))
              .map((historico) => ({
                historico,
                doc: findScopedDocument(historico.certificado_arquivo_id ?? 0, empresaId),
              }))
              .filter(({ doc }) => doc)
              .map(({ historico, doc }) => ({
                id: doc!.id,
                nome_arquivo: doc!.nome_arquivo,
                r2_key: doc!.r2_key,
                tamanho: doc!.tamanho,
                funcionario_nome: `Funcionario ${historico.funcionario_id}`,
                funcionario_matricula: 'M1',
                qualif_codigo: 'CERT',
              })),
          };
        }

        if (query.includes('WHERE d.funcionario_id = ?') && query.includes('f.empresa_id = ?')) {
          return {
            results: findScopedDocumentsByFuncionario(Number(args[0]), Number(args[1])),
          };
        }

        return { results: [] };
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        runs.push({ query, args });
        return { meta: { changes: 1, last_row_id: 999 } };
      };

      return {
        first: async () => executeFirst([]),
        all: async () => executeAll([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          all: async () => executeAll(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return {
    env: { DB: db, BUCKET: bucket } as unknown as Env,
    bucket,
    runs,
    calls,
  };
}

async function request(path: string, env: Env, empresaId = 1, init: RequestInit = {}) {
  const app = createApp();
  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer test-token');
  headers.set('x-test-empresa-id', String(empresaId));
  return app.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    env,
    {} as ExecutionContext,
  );
}

describe('documentos tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia stream cross-tenant antes de ler R2', async () => {
    const { env, bucket } = createMockEnv();

    const response = await request('/api/pasta-virtual/stream/202', env, 1);

    expect(response.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('mantem stream do tenant correto', async () => {
    const { env, bucket } = createMockEnv();

    const response = await request('/api/pasta-virtual/stream/101', env, 1);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('pdf-body');
    expect(bucket.get).toHaveBeenCalledWith('certificados/a.pdf');
  });

  it('bloqueia download cross-tenant antes de ler R2', async () => {
    const { env, bucket } = createMockEnv();

    const response = await request('/api/pasta-virtual/download/202', env, 1);

    expect(response.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('bloqueia ZIP de certificados cross-tenant antes de ler R2', async () => {
    const { env, bucket } = createMockEnv();

    const response = await request('/api/pasta-virtual/download-certificados/22', env, 1);

    expect(response.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it('mantem export-zip do tenant correto e filtra ids cross-tenant', async () => {
    const { env, bucket } = createMockEnv();

    const response = await request('/api/certificados/historico/export-zip', env, 1, {
      method: 'POST',
      body: JSON.stringify({ ids: [501, 502] }),
      headers: { 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);
    expect(bucket.get).toHaveBeenCalledTimes(1);
    expect(bucket.get).toHaveBeenCalledWith('certificados/a.pdf');
  });

  it('bloqueia export-zip para role nao-admin antes de tocar R2', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/certificados/historico/export-zip', env, 1, {
      method: 'POST',
      body: JSON.stringify({ ids: [501] }),
      headers: {
        'Content-Type': 'application/json',
        'x-test-role': 'viewer',
      },
    });

    expect(response.status).toBe(403);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it('bloqueia delete de pasta virtual cross-tenant sem mutation nem R2', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/pasta-virtual/delete/202', env, 1, { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it('bloqueia delete de certificado cross-tenant sem mutation nem R2', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/certificados/historico/502/certificados/202', env, 1, {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
    expect(runs).toHaveLength(0);
  });

  it('recupera certificados orfaos somente dentro do tenant atual', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/certificados/recuperar-orfaos', env, 1, {
      method: 'POST',
    });
    const body = await response.json<{ data: { linkedCount: number; orfaosCount: number } }>();

    expect(response.status).toBe(200);
    expect(body.data.linkedCount).toBe(1);
    expect(body.data.orfaosCount).toBe(1);
    expect(runs).toHaveLength(2);
    expect(runs[0].args).toEqual([303, 601, 11, 1]);
    expect(runs[1].query).toContain('INSERT INTO audit_events_v2');
    expect(JSON.stringify(runs)).not.toContain('404');
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('limpa refs orfas e cross-tenant somente no tenant atual', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/certificados/limpar-refs-orfas', env, 1, {
      method: 'POST',
    });
    const body = await response.json<{ data: { cleanedCount: number; refsCount: number } }>();

    expect(response.status).toBe(200);
    expect(body.data.cleanedCount).toBe(1);
    expect(body.data.refsCount).toBe(1);
    expect(runs).toHaveLength(2);
    expect(runs[0].args).toEqual([701, 1]);
    expect(runs[1].query).toContain('INSERT INTO audit_events_v2');
    expect(JSON.stringify(runs)).not.toContain('502');
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('nao lista metadado de certificado quando historico aponta para documento cross-tenant', async () => {
    const { env, bucket, runs } = createMockEnv();

    const response = await request('/api/certificados/historico/701/certificados', env, 1);
    const body = await response.json<{ data: unknown[] }>();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(runs).toHaveLength(1);
    expect(runs[0].args).toEqual([701, 1, 202]);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('bloqueia admin residual sem Authorization antes de mutation', async () => {
    const app = createApp();
    const { env, bucket, runs } = createMockEnv();

    const response = await app.fetch(
      new Request('http://localhost/api/certificados/recuperar-orfaos', { method: 'POST' }),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(runs).toHaveLength(0);
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.put).not.toHaveBeenCalled();
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('bloqueia sem Authorization', async () => {
    const app = createApp();
    const { env, bucket } = createMockEnv();

    const response = await app.fetch(
      new Request('http://localhost/api/pasta-virtual/stream/101'),
      env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(401);
    expect(bucket.get).not.toHaveBeenCalled();
  });
});
