/**
 * Tests that the public SCORM routes (/scorm/launch and /scorm/preview) correctly
 * resolve empresa_id from the JWT payload when there is no tenant middleware context.
 *
 * Regression: PR #105 hardened getEmpresaIdSafe() to throw when empresaId <= 0,
 * making the `|| Number(payload.empresa_id ?? 0)` fallback unreachable on public
 * routes that skip auth/tenantMiddleware. Fix: use getEmpresaIdOptional() instead.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { verifyJWTMock, generateJWTMock } = vi.hoisted(() => ({
  verifyJWTMock: vi.fn(),
  generateJWTMock: vi.fn(async () => ({ token: 'test-token', expiresAt: '' })),
}));

vi.mock('../../utils/security', () => ({
  verifyJWT: verifyJWTMock,
  generateJWT: generateJWTMock,
}));

// Simulate a public route: no tenant middleware ran, so getEmpresaIdOptional returns undefined.
vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdOptional: () => undefined,
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
  validateAccessTokenSecurityState: vi.fn(async (_db: unknown, payload: { role?: string }) => ({
    role: payload.role || 'USUARIO',
  })),
}));

vi.mock('../../config/allowed-origins', () => ({
  resolveAllowedOrigin: () => 'http://localhost:3000',
}));

import lmsAssetsRoutes from '../../routes/lms-assets';
import { errorHandler } from '../../middleware/error-handler';

type QueryHandler = {
  first?: (...args: unknown[]) => unknown;
  run?: (...args: unknown[]) => unknown;
  all?: (...args: unknown[]) => unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled DB query: ${query}`);
      const handler = entry[1];
      const bind = (...bindArgs: unknown[]) => ({
        first: async () => (handler.first ? handler.first(bindArgs) : null),
        run: async () =>
          handler.run ? handler.run(bindArgs) : { meta: { changes: 1, last_row_id: 0 } },
        all: async () => (handler.all ? handler.all(bindArgs) : { results: [] }),
      });
      return {
        first: async () => (handler.first ? handler.first([]) : null),
        run: async () => (handler.run ? handler.run([]) : { meta: { changes: 1, last_row_id: 0 } }),
        all: async () => (handler.all ? handler.all([]) : { results: [] }),
        bind,
      };
    }),
  } as unknown as D1Database;
  return db;
}

function createMockBucket(): R2Bucket {
  const mockObj = {
    key: 'lms/scorm/6/99/index.html',
    size: 100,
    etag: 'test-etag',
    httpEtag: '"test-etag"',
    version: 'v1',
    uploaded: new Date(),
    storageClass: 'Standard',
    checksums: { toJSON: () => ({}) },
    customMetadata: {},
    httpMetadata: {},
    body: new ReadableStream(),
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    json: async () => ({}),
    text: async () => '',
    writeHttpMetadata: (_h: Headers) => {},
  };
  return {
    get: vi.fn(async () => mockObj),
    list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(async () => mockObj),
  } as unknown as R2Bucket;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/', lmsAssetsRoutes);
  return app;
}

function makeEnv(db: D1Database): Env {
  return {
    DB: db,
    BUCKET: createMockBucket(),
    JWT_SECRET: 'test-secret',
    CORS_ORIGINS: '',
  } as unknown as Env;
}

describe('SCORM public routes — empresa_id resolved from JWT payload (no tenant context)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /scorm/launch/:matricula_id', () => {
    it('returns 200 with SCORM HTML when JWT carries empresa_id and no tenant context is set', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 6,
        funcionario_id: 42,
        role: 'admin',
        sub: '42',
      });

      const db = createMockDb([
        [
          'FROM lms_matriculas m',
          {
            first: () => ({
              id: 77,
              funcionario_id: 42,
              empresa_id: 6,
              status: 'EM_ANDAMENTO',
              curso_id: 99,
              titulo: 'Curso SCORM Teste',
              scorm_versao: '1.2',
              scorm_package_r2_prefix: null,
              scorm_launch_file: 'index.html',
              ativo: 1,
              publicado: 1,
            }),
          },
        ],
        ['lms_progresso_scorm', { first: () => null }],
        ['lms_matricula_ciclos', { first: () => ({ id: 44 }) }],
      ]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/launch/77', {
          headers: { Authorization: 'Bearer test.jwt.token' },
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('scorm');
    });

    it('returns 401 when JWT has no empresa_id and no tenant context (empresa remains 0)', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: null,
        funcionario_id: 0,
        role: 'student',
        sub: '0',
      });

      const db = createMockDb([]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/launch/77', {
          headers: { Authorization: 'Bearer test.jwt.token' },
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toContain('Empresa não identificada');
    });

    it('uses the package activated before the in-progress enrollment cycle', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 6,
        funcionario_id: 42,
        role: 'admin',
        sub: '42',
      });
      const currentPrefix = 'lms/scorm/6/99/_candidates/current-package/';
      const db = createMockDb([
        [
          'FROM lms_matriculas m',
          {
            first: () => ({
              id: 77,
              funcionario_id: 42,
              empresa_id: 6,
              status: 'EM_ANDAMENTO',
              curso_id: 99,
              ativo: 1,
              publicado: 1,
              scorm_package_r2_prefix: currentPrefix,
              scorm_launch_file: 'index.html',
              scorm_versao: '1.2',
              cycle_started_at: '2026-09-14T14:46:16Z',
            }),
          },
        ],
        ['lms_scorm_package_audit_log', { all: () => ({ results: [{
          package_id: 'package-current', package_sha256: 'a'.repeat(64), r2_prefix: currentPrefix,
          launch_file: 'index.html', scorm_versao: '1.2', package_status: 'ACTIVE',
          activated_at: '2026-09-10T00:00:00Z',
        }] }) }],
      ]);

      const response = await createApp().fetch(
        new Request('https://airtrust-api-staging.airtrust.workers.dev/assets/session', {
          method: 'POST',
          headers: { Authorization: 'Bearer test.jwt.token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ matricula_id: 77 }),
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      expect(generateJWTMock).toHaveBeenCalledWith(
        expect.objectContaining({
          asset_matricula_id: 77,
          asset_curso_id: 99,
          asset_scorm_package_prefix: currentPrefix,
        }),
        'test-secret',
        expect.any(Number),
      );
    });

    it('uses the package activated before a completed enrollment cycle', async () => {
      verifyJWTMock.mockResolvedValue({ empresa_id: 6, funcionario_id: 42, role: 'admin', sub: '42' });
      const currentPrefix = 'lms/scorm/6/99/_candidates/current-package/';
      const db = createMockDb([[
        'FROM lms_matriculas m',
        { first: () => ({ id: 77, funcionario_id: 42, empresa_id: 6, status: 'CONCLUIDO', curso_id: 99, data_inicio: '2026-09-14 14:46:16', cycle_started_at: '2026-09-14T14:46:16Z', ativo: 1, publicado: 1, scorm_package_r2_prefix: currentPrefix, scorm_launch_file: 'index.html', scorm_versao: '1.2' }) },
      ], ['lms_scorm_package_audit_log', { all: () => ({ results: [{
        package_id: 'package-current', package_sha256: 'a'.repeat(64), r2_prefix: currentPrefix,
        launch_file: 'index.html', scorm_versao: '1.2', package_status: 'ACTIVE',
        activated_at: '2026-09-10T00:00:00Z',
      }] }) }]]);

      const response = await createApp().fetch(
        new Request('https://airtrust-api-staging.airtrust.workers.dev/assets/session', {
          method: 'POST', headers: { Authorization: 'Bearer test.jwt.token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ matricula_id: 77 }),
        }), makeEnv(db), {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      expect(generateJWTMock).toHaveBeenCalledWith(
        expect.objectContaining({ asset_matricula_id: 77, asset_curso_id: 99, asset_scorm_package_prefix: currentPrefix }),
        'test-secret', expect.any(Number),
      );
    });

    it('sets the scoped asset-session cookie with SameSite=None; Secure on a non-local request', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 6,
        funcionario_id: 42,
        role: 'admin',
        sub: '42',
      });

      const db = createMockDb([
        [
          'FROM lms_matriculas m',
          {
            first: () => ({
              id: 77,
              funcionario_id: 42,
              empresa_id: 6,
              status: 'EM_ANDAMENTO',
              curso_id: 99,
              ativo: 1,
              publicado: 1,
            }),
          },
        ],
      ]);

      const app = createApp();
      const response = await app.fetch(
        new Request('https://airtrust-api-staging.airtrust.workers.dev/assets/session', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test.jwt.token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ matricula_id: 77 }),
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      const setCookie = response.headers.get('set-cookie') ?? '';
      expect(setCookie).toContain('SameSite=None');
      expect(setCookie).toContain('Secure');
    });

    it('returns 401 when no token is provided', async () => {
      verifyJWTMock.mockResolvedValue(null);

      const db = createMockDb([]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/launch/77'),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(401);
    });
  });

  describe('GET /scorm/preview/:curso_id', () => {
    it('returns 200 with SCORM HTML when admin JWT carries empresa_id and no tenant context is set', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 6,
        role: 'admin',
        sub: '10',
      });

      const db = createMockDb([
        [
          'FROM lms_cursos',
          {
            first: () => ({
              id: 99,
              empresa_id: 6,
              titulo: 'Curso Preview',
              scorm_versao: '1.2',
              scorm_launch_file: 'index.html',
            }),
          },
        ],
      ]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/preview/99', {
          headers: { Authorization: 'Bearer test.jwt.token' },
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('returns 403 when JWT role is not admin/manager regardless of empresa_id', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 6,
        role: 'student',
        sub: '42',
      });

      const db = createMockDb([]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/preview/99', {
          headers: { Authorization: 'Bearer test.jwt.token' },
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(403);
    });

    it('returns 401 when token is invalid', async () => {
      verifyJWTMock.mockResolvedValue(null);

      const db = createMockDb([]);

      const app = createApp();
      const response = await app.fetch(
        new Request('http://localhost/scorm/preview/99', {
          headers: { Authorization: 'Bearer invalid.token' },
        }),
        makeEnv(db),
        {} as ExecutionContext,
      );

      expect(response.status).toBe(401);
    });
  });
});

describe('Native V1 isolation from legacy SCORM assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyJWTMock.mockResolvedValue({
      empresa_id: 6, funcionario_id: 42, role: 'admin', sub: '42',
    });
  });

  it('does not mint a legacy media token for a Native enrollment', async () => {
    const db = createMockDb([['FROM lms_matriculas m', { first: () => ({
      id: 77, curso_id: 99, funcionario_id: 42, status: 'EM_ANDAMENTO',
      ativo: 1, publicado: 1, tipo_conteudo: 'native',
      scorm_package_r2_prefix: null,
    }) }]]);
    const env = makeEnv(db);
    const response = await createApp().fetch(new Request('https://api.example.com/assets/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer test.jwt.token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricula_id: 77 }),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(generateJWTMock).not.toHaveBeenCalled();
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });

  it('denies direct legacy SCORM media for Native, including admin access', async () => {
    const db = createMockDb([['FROM lms_cursos', { first: () => ({
      id: 99, empresa_id: 6, ativo: 1, publicado: 1,
      tipo_conteudo: 'native', scorm_package_r2_prefix: null,
    }) }]]);
    const env = makeEnv(db);
    const response = await createApp().fetch(new Request(
      'https://api.example.com/scorm/assets/6/99/index.html',
      { headers: { Authorization: 'Bearer test.jwt.token' } },
    ), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });


  it('blocks staging-activated SCORM-physical course assets even for an admin', async () => {
    const db = createMockDb([
      ['FROM lms_native_catalog_activation', { first: () => ({ curso_id: 99 }) }],
      ['FROM lms_cursos', { first: () => ({
        id: 99, empresa_id: 6, ativo: 1, publicado: 1,
        tipo_conteudo: 'scorm', scorm_package_r2_prefix: null,
      }) }],
    ]);
    const env = { ...makeEnv(db), ENVIRONMENT: 'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6' } as Env;
    const response = await createApp().fetch(new Request(
      'https://api.example.com/scorm/assets/6/99/index.html',
      { headers: { Authorization: 'Bearer test.jwt.token' } },
    ), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });

  it('does not mint a SCORM session for a staging-marked Native course', async () => {
    const db = createMockDb([
      ['FROM lms_native_catalog_activation', { first: () => ({ curso_id: 99 }) }],
      ['FROM lms_matriculas m', { first: () => ({
        id: 77, curso_id: 99, funcionario_id: 42, status: 'EM_ANDAMENTO',
        ativo: 1, publicado: 1, tipo_conteudo: 'scorm',
        scorm_package_r2_prefix: null,
      }) }],
    ]);
    const env = { ...makeEnv(db), ENVIRONMENT: 'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6' } as Env;
    const response = await createApp().fetch(new Request('https://api.example.com/assets/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer test.jwt.token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ matricula_id: 77 }),
    }), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(generateJWTMock).not.toHaveBeenCalled();
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });

  it('fails closed if staging activation-table lookup cannot be completed', async () => {
    const db = createMockDb([['FROM lms_cursos', { first: () => ({
      id: 99, empresa_id: 6, titulo: 'Native ativado',
      tipo_conteudo: 'scorm', scorm_launch_file: 'index.html',
      scorm_package_r2_prefix: null,
    }) }]]);
    const env = { ...makeEnv(db), ENVIRONMENT: 'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6' } as Env;
    const response = await createApp().fetch(new Request(
      'https://api.example.com/scorm/preview/99',
      { headers: { Authorization: 'Bearer test.jwt.token' } },
    ), env, {} as ExecutionContext);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'NATIVE_CATALOG_ACTIVATION_LOOKUP_FAILED',
    });
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });

  it('denies Native in SCORM administrative preview without reading R2', async () => {
    const db = createMockDb([['FROM lms_cursos', { first: () => ({
      id: 99, empresa_id: 6, titulo: 'Native', tipo_conteudo: 'native',
      scorm_versao: '1.2', scorm_launch_file: 'index.html',
      scorm_package_r2_prefix: null,
    }) }]]);
    const env = makeEnv(db);
    const response = await createApp().fetch(new Request(
      'https://api.example.com/scorm/preview/99',
      { headers: { Authorization: 'Bearer test.jwt.token' } },
    ), env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(env.BUCKET.get).not.toHaveBeenCalled();
  });
});
