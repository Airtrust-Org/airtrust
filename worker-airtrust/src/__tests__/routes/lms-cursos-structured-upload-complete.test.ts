import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Env } from '../../types';

const authState = vi.hoisted(() => ({
  role: 'admin',
  userId: 42,
  empresaId: 77,
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    c.set('userId', authState.userId);
    c.set('userRole', authState.role);
    c.set('empresaId', authState.empresaId);
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => authState.empresaId,
}));

import lmsCursosRoutes from '../../routes/lms-cursos';

function createTestApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError((error, c) => {
    const status =
      typeof error === 'object' && error && 'statusCode' in error
        ? Number((error as { statusCode?: number }).statusCode) || 500
        : 500;
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Erro interno' }, status);
  });
  app.route('/cursos', lmsCursosRoutes);
  return app;
}

function createDb() {
  return {
    prepare: vi.fn((query: string) => {
      if (query.includes('SELECT id, empresa_id, titulo FROM lms_cursos')) {
        return {
          bind: (..._args: unknown[]) => ({
            first: async () => ({ id: 12, empresa_id: authState.empresaId, titulo: 'Offshore' }),
          }),
        };
      }

      if (query.includes('UPDATE lms_cursos')) {
        return {
          bind: (..._args: unknown[]) => ({
            run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
          }),
        };
      }

      throw new Error(`Unhandled query in structured upload complete test: ${query}`);
    }),
  } as unknown as D1Database;
}

function createBucketWithObjects(keys: string[]) {
  return {
    list: vi.fn(async ({ prefix }: { prefix?: string }) => ({
      objects: keys.filter((key) => (prefix ? key.startsWith(prefix) : true)).map((key) => ({ key })),
      truncated: false,
      cursor: undefined,
      delimitedPrefixes: [],
    })),
    delete: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
    head: vi.fn(async () => null),
  } as unknown as R2Bucket;
}

describe('lms cursos structured upload complete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.role = 'admin';
    authState.userId = 42;
    authState.empresaId = 77;
  });

  it('falha quando skip_purge deixa arquivo legado mascarar falta de arquivo novo', async () => {
    const prefix = 'lms/scorm/77/12/';
    const bucket = createBucketWithObjects([
      `${prefix}imsmanifest.xml`,
      `${prefix}legacy-video.mp4`,
    ]);

    const app = createTestApp();
    const response = await app.request(
      '/cursos/12/content-upload/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo_conteudo: 'scorm',
          launch_file: 'index.html',
          scorm_versao: '1.2',
          arquivo_nome: 'Operacoes_Offshore_SCORM12_Rev01.zip',
          files_uploaded: 2,
          uploaded_paths: ['imsmanifest.xml', 'app.js'],
        }),
      },
      { DB: createDb(), BUCKET: bucket } as Env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: 'Upload incompleto: 1/2 arquivos confirmados no storage',
    });
  });
});
