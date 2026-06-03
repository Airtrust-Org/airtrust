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
      c.set('userRole', 'admin');
      await next();
    },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: (c: any) => ({
    empresaId: Number(c.get('empresaId') || 0),
    empresaCodigo: `empresa-${Number(c.get('empresaId') || 0)}`,
    empresaNome: 'Empresa Teste',
    role: 'admin',
    plano: 'pro',
    permissions: ['read', 'write'],
  }),
  getEmpresaId: (c: any) => Number(c.get('empresaId') || 0),
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole:
    () =>
    async (_c: any, next: () => Promise<void>) =>
      next(),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: vi.fn(),
  extrairUsuarioAuditoria: () => ({ usuario_id: 10, origem: 'test' }),
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
  certificado_arquivo_id: number;
  empresa_id: number;
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
      id: 202,
      funcionario_id: 22,
      empresa_id: 2,
      nome_arquivo: 'CERT-TENANT-B.pdf',
      tipo: 'application/pdf',
      tamanho: 7,
      r2_key: 'certificados/b.pdf',
      deleted_at: null,
    },
  ];

  const historicos: HistoricoRow[] = [
    {
      id: 501,
      funcionario_id: 11,
      certificado_arquivo_id: 101,
      empresa_id: 1,
      deleted_at: null,
    },
    {
      id: 502,
      funcionario_id: 22,
      certificado_arquivo_id: 202,
      empresa_id: 2,
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

        if (query.includes('FROM qualificacoes_historico qh')) {
          const empresaId = Number(args[0]);
          const ids = args.slice(1).map(Number);
          return {
            results: historicos
              .filter((historico) => !historico.deleted_at)
              .filter((historico) => ids.length === 0 || ids.includes(historico.id))
              .map((historico) => ({
                historico,
                doc: findScopedDocument(historico.certificado_arquivo_id, empresaId),
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
