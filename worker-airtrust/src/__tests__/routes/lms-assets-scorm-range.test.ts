/**
 * Tests for HTTP Range request support on the main SCORM assets endpoint
 * GET /api/lms/scorm/assets/:empresa_id/:curso_id/*
 *
 * Context: The endpoint previously returned 200 for all requests, breaking video
 * playback on Safari/iOS (which requires 206 for video). Fix adds Range handling
 * for video/* MIME types only.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const { verifyJWTMock, validateAccessTokenSecurityStateMock } = vi.hoisted(() => ({
  verifyJWTMock: vi.fn(),
  validateAccessTokenSecurityStateMock: vi.fn(),
}));

vi.mock('../../utils/security', () => ({
  verifyJWT: verifyJWTMock,
  generateJWT: vi.fn(async () => ({ token: 'test-token', expiresAt: '' })),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
  validateAccessTokenSecurityState: validateAccessTokenSecurityStateMock,
}));

vi.mock('../../config/allowed-origins', () => ({
  resolveAllowedOrigin: () => 'http://localhost:3000',
}));

import lmsAssetsRoutes from '../../routes/lms-assets';
import { ApiError, errorHandler } from '../../middleware/error-handler';

const VIDEO_SIZE = 8_828_890;

function makeVideoBody(bytes: number) {
  return new Uint8Array(bytes).fill(0x00);
}

function makeMockR2Object(opts: { key: string; size?: number; bodyBytes?: number } = { key: 'test.mp4' }) {
  const size = opts.size ?? VIDEO_SIZE;
  const bodyBytes = opts.bodyBytes ?? size;
  return {
    key: opts.key,
    size,
    etag: 'etag-abc',
    httpEtag: '"etag-abc"',
    version: 'v1',
    uploaded: new Date(),
    storageClass: 'Standard',
    checksums: { toJSON: () => ({}) },
    customMetadata: {},
    httpMetadata: {},
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(makeVideoBody(bodyBytes));
        controller.close();
      },
    }),
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(bodyBytes),
    blob: async () => new Blob([makeVideoBody(bodyBytes)]),
    json: async () => ({}),
    text: async () => '',
    writeHttpMetadata: (_h: Headers) => {},
  };
}

function createMockDb() {
  return {
    prepare: vi.fn((query: string) => {
      const bind = () => ({
        first: async () => {
          if (query.includes('FROM lms_cursos')) {
            return { id: 7, ativo: 1, publicado: 1 };
          }
          if (query.includes('FROM lms_matriculas')) {
            return { id: 1 };
          }
          return null;
        },
        run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
        all: async () => ({ results: [] }),
      });
      return { bind, first: async () => null, run: async () => ({}), all: async () => ({ results: [] }) };
    }),
  } as unknown as D1Database;
}

function createBucket(
  getImpl?: (key: string, opts?: { range?: { offset: number; length?: number } }) => unknown,
) {
  const defaultGet = (key: string, opts?: { range?: { offset: number; length?: number } }) => {
    const obj = makeMockR2Object({ key });
    if (opts?.range) {
      const offset = opts.range.offset;
      const length = opts.range.length ?? VIDEO_SIZE - offset;
      return { ...obj, size: VIDEO_SIZE, body: new ReadableStream({ start(c) { c.enqueue(makeVideoBody(length)); c.close(); } }) };
    }
    return obj;
  };

  return {
    get: vi.fn(getImpl ?? defaultGet),
    list: vi.fn(async () => ({ objects: [], truncated: false, delimitedPrefixes: [] })),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(async () => null),
  } as unknown as R2Bucket;
}

function makeEnv(bucket = createBucket()): Env {
  return {
    DB: createMockDb(),
    BUCKET: bucket,
    JWT_SECRET: 'test-secret',
    CORS_ORIGINS: '',
  } as unknown as Env;
}

function createApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.onError(errorHandler);
  app.route('/api/lms', lmsAssetsRoutes);
  return app;
}

async function getAsset(path: string, env: Env, headers: Record<string, string> = {}) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, {
      headers: {
        Authorization: 'Bearer test-token',
        ...headers,
      },
    }),
    env,
    {} as ExecutionContext,
  );
}

const BASE = '/api/lms/scorm/assets/6/7';
const VIDEO_PATH = `${BASE}/Operacoes_Offshore_SCORM12_Rev01/media/original/test.mp4`;
const JS_PATH = `${BASE}/Operacoes_Offshore_SCORM12_Rev01/app.js`;

describe('SCORM assets — Range request support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyJWTMock.mockResolvedValue({
      empresa_id: 6,
      funcionario_id: 42,
      role: 'admin',
      sub: '42',
      jti: 'access-jti-1',
    });
    validateAccessTokenSecurityStateMock.mockResolvedValue({ role: 'ADMIN' });
  });

  describe('request sem Range — comportamento base preservado', () => {
    it('retorna 200 para vídeo sem Range header', async () => {
      const res = await getAsset(VIDEO_PATH, makeEnv());
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    });

    it('retorna 200 para arquivo JS sem Range header', async () => {
      const res = await getAsset(JS_PATH, makeEnv());
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('javascript');
    });
  });

  describe('Range request para vídeo — resposta 206', () => {
    it('retorna 206 com Content-Range correto para range parcial', async () => {
      const res = await getAsset(VIDEO_PATH, makeEnv(), { Range: 'bytes=0-1023' });
      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe(`bytes 0-1023/${VIDEO_SIZE}`);
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
      expect(res.headers.get('Content-Type')).toBe('video/mp4');
    });

    it('retorna 206 com Content-Range correto para range aberto (bytes=N-)', async () => {
      const offset = 8_000_000;
      const res = await getAsset(VIDEO_PATH, makeEnv(), { Range: `bytes=${offset}-` });
      expect(res.status).toBe(206);
      const expectedEnd = VIDEO_SIZE - 1;
      expect(res.headers.get('Content-Range')).toBe(`bytes ${offset}-${expectedEnd}/${VIDEO_SIZE}`);
      expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    });

    it('retorna 206 com Content-Range correto para range próximo ao final', async () => {
      const offset = VIDEO_SIZE - 512;
      const end = VIDEO_SIZE - 1;
      const res = await getAsset(VIDEO_PATH, makeEnv(), { Range: `bytes=${offset}-${end}` });
      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe(`bytes ${offset}-${end}/${VIDEO_SIZE}`);
    });
  });

  describe('Range request para não-vídeo — ignora Range', () => {
    it('retorna 200 para arquivo .js mesmo com Range header', async () => {
      const res = await getAsset(JS_PATH, makeEnv(), { Range: 'bytes=0-1023' });
      expect(res.status).toBe(200);
    });

    it('retorna 200 para arquivo .html mesmo com Range header', async () => {
      const htmlPath = `/api/lms/scorm/assets/6/7/Operacoes_Offshore_SCORM12_Rev01/index.html`;
      const res = await getAsset(htmlPath, makeEnv(), { Range: 'bytes=0-1023' });
      expect(res.status).toBe(200);
    });
  });

  describe('range inválido — fallback seguro', () => {
    it('retorna 200 quando Range header não bate o padrão bytes=N-M', async () => {
      const res = await getAsset(VIDEO_PATH, makeEnv(), { Range: 'invalid-range-value' });
      expect(res.status).toBe(200);
    });
  });

  describe('asset não encontrado', () => {
    it('retorna 404 quando R2 não tem o objeto', async () => {
      const emptyBucket = createBucket(() => null);
      const res = await getAsset(VIDEO_PATH, makeEnv(emptyBucket));
      expect(res.status).toBe(404);
    });
  });

  describe('autenticação preservada', () => {
    it('revalida o estado mutável de um bearer access token antes de servir R2', async () => {
      const env = makeEnv();
      const res = await getAsset(VIDEO_PATH, env);

      expect(res.status).toBe(200);
      expect(validateAccessTokenSecurityStateMock).toHaveBeenCalledTimes(1);
      expect(validateAccessTokenSecurityStateMock).toHaveBeenCalledWith(
        env.DB,
        expect.objectContaining({ sub: '42', empresa_id: 6, jti: 'access-jti-1' }),
      );
    });

    it('bloqueia asset quando o bearer access token foi revogado', async () => {
      validateAccessTokenSecurityStateMock.mockRejectedValueOnce(
        new ApiError('Token revogado. Faça login novamente.', 401, 'TOKEN_REVOKED'),
      );

      const res = await getAsset(VIDEO_PATH, makeEnv());
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: 'TOKEN_REVOKED',
      });
    });

    it('retorna 401 sem token de autenticação', async () => {
      verifyJWTMock.mockResolvedValue(null);
      const app = createApp();
      const res = await app.fetch(
        new Request(`http://localhost${VIDEO_PATH}`),
        makeEnv(),
        {} as ExecutionContext,
      );
      expect(res.status).toBe(401);
    });

    it('retorna 403 quando empresa_id do token não bate o da URL', async () => {
      verifyJWTMock.mockResolvedValue({
        empresa_id: 99,
        funcionario_id: 42,
        role: 'admin',
        sub: '42',
      });
      const res = await getAsset(VIDEO_PATH, makeEnv());
      expect(res.status).toBe(403);
    });
  });
});
