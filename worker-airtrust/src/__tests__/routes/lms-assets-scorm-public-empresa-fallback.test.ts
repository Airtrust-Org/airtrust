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

const { verifyJWTMock } = vi.hoisted(() => ({
  verifyJWTMock: vi.fn(),
}));

vi.mock('../../utils/security', () => ({
  verifyJWT: verifyJWTMock,
  generateJWT: vi.fn(async () => ({ token: 'test-token', expiresAt: '' })),
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
        all: async () =>
          handler.all ? handler.all(bindArgs) : { results: [] },
      });
      return {
        first: async () => (handler.first ? handler.first([]) : null),
        run: async () =>
          handler.run ? handler.run([]) : { meta: { changes: 1, last_row_id: 0 } },
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
        [
          'lms_progresso_scorm',
          { first: () => null },
        ],
        [
          'lms_matricula_ciclos',
          { first: () => ({ id: 44 }) },
        ],
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
