/**
 * Regression tests for SCORM asset resolution correctly honoring the
 * course's active/pinned package prefix (lms_cursos.scorm_package_r2_prefix)
 * instead of falling back to an unordered R2 bucket listing across every
 * candidate a course has ever had.
 *
 * Root cause (pre-fix): when the direct object key missed, resolveScormObject()
 * fell back to bucket.list({prefix: courseBasePrefix}) and picked the first
 * matching entry. R2 list() returns keys in lexicographic order, not by
 * activation recency, so an older/superseded `_candidates/<uuid>/` folder
 * could sort before the actually-ACTIVE one and be served silently instead —
 * confirmed live: candidate `12f7d6fd...` (superseded) was served instead of
 * the active `7503f97e...` for a freshly created enrollment.
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

const EMPRESA_ID = 6;
const CURSO_ID = 7;
const ACTIVE_PREFIX = `lms/scorm/${EMPRESA_ID}/${CURSO_ID}/_candidates/7503f97e-active/`;
const SUPERSEDED_PREFIX = `lms/scorm/${EMPRESA_ID}/${CURSO_ID}/_candidates/12f7d6fd-old/`;

function makeR2Object(key: string) {
  return {
    key,
    size: 10,
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
        controller.enqueue(new Uint8Array(10));
        controller.close();
      },
    }),
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(10),
    blob: async () => new Blob([new Uint8Array(10)]),
    json: async () => ({}),
    text: async () => 'content',
    writeHttpMetadata: (_h: Headers) => {},
  };
}

/**
 * Simulates an R2 bucket that holds the SAME relative file (e.g. index.html)
 * under two different `_candidates/<uuid>/` folders — one superseded, one
 * active — plus (optionally) a legacy flat-prefix copy for courses that
 * predate the versioned-candidate system.
 */
function createMultiCandidateBucket(opts: {
  legacyFlatCopy?: boolean;
  activePrefixHasFile?: boolean;
} = {}) {
  const { legacyFlatCopy = false, activePrefixHasFile = true } = opts;
  const keys = new Set<string>();
  keys.add(`${SUPERSEDED_PREFIX}index.html`);
  keys.add(`${SUPERSEDED_PREFIX}app.js`);
  if (activePrefixHasFile) {
    keys.add(`${ACTIVE_PREFIX}index.html`);
    keys.add(`${ACTIVE_PREFIX}app.js`);
  }
  if (legacyFlatCopy) {
    keys.add(`lms/scorm/${EMPRESA_ID}/${CURSO_ID}/index.html`);
  }

  return {
    get: vi.fn(async (key: string) => (keys.has(key) ? makeR2Object(key) : null)),
    list: vi.fn(async ({ prefix }: { prefix: string }) => ({
      objects: Array.from(keys)
        .filter((k) => k.startsWith(prefix))
        .sort() // R2 list() is lexicographically ordered — this mirrors that.
        .map((key) => ({ key })),
      truncated: false,
      delimitedPrefixes: [],
    })),
    put: vi.fn(),
    delete: vi.fn(),
    head: vi.fn(async () => null),
  } as unknown as R2Bucket;
}

function createMockDb(scormPackageR2Prefix: string | null) {
  return {
    prepare: vi.fn((query: string) => ({
      bind: () => ({
        first: async () => {
          if (query.includes('FROM lms_cursos')) {
            return { id: CURSO_ID, ativo: 1, publicado: 1, scorm_package_r2_prefix: scormPackageR2Prefix };
          }
          if (query.includes('FROM lms_matriculas')) {
            return { id: 1 };
          }
          return null;
        },
        run: async () => ({ meta: { changes: 1, last_row_id: 0 } }),
        all: async () => ({ results: [] }),
      }),
      first: async () => null,
      run: async () => ({}),
      all: async () => ({ results: [] }),
    })),
  } as unknown as D1Database;
}

function makeEnv(bucket: R2Bucket, scormPackageR2Prefix: string | null): Env {
  return {
    DB: createMockDb(scormPackageR2Prefix),
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

async function getAsset(path: string, env: Env) {
  const app = createApp();
  return app.fetch(
    new Request(`http://localhost${path}`, { headers: { Authorization: 'Bearer test-token' } }),
    env,
    {} as ExecutionContext,
  );
}

describe('SCORM asset resolution — active/pinned candidate prefix (BUG 1 regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyJWTMock.mockResolvedValue({
      empresa_id: EMPRESA_ID,
      funcionario_id: 42,
      role: 'admin',
      sub: '42',
    });
  });

  it('serves the file from the ACTIVE candidate prefix, not the lexicographically-first superseded one', async () => {
    const bucket = createMultiCandidateBucket();
    const env = makeEnv(bucket, ACTIVE_PREFIX);

    // Bare "index.html" wildcard with no candidate segment forces the resolver
    // through the fallback path — this is exactly the launch-file resolution
    // shape that triggered the bug.
    const res = await getAsset(`/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/index.html`, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-LMS-Asset-Key')).toBe(`${ACTIVE_PREFIX}index.html`);
    // Must never have resolved to the superseded candidate, even though it
    // sorts first lexicographically and list() would return it first.
    expect(res.headers.get('X-LMS-Asset-Key')).not.toContain('12f7d6fd-old');
  });

  it('fails closed (404) when the active prefix does not contain the expected file, instead of silently falling back to another candidate', async () => {
    const bucket = createMultiCandidateBucket({ activePrefixHasFile: false });
    const env = makeEnv(bucket, ACTIVE_PREFIX);

    const res = await getAsset(`/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/index.html`, env);

    expect(res.status).toBe(404);
    // Bucket.list() must never even be consulted once an active prefix is
    // pinned — resolution within that prefix is a direct, scoped get().
    expect(bucket.list).not.toHaveBeenCalled();
  });

  it('resolves sibling assets (app.js) from the same active candidate prefix as index.html', async () => {
    const bucket = createMultiCandidateBucket();
    const env = makeEnv(bucket, ACTIVE_PREFIX);

    const res = await getAsset(`/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/app.js`, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-LMS-Asset-Key')).toBe(`${ACTIVE_PREFIX}app.js`);
  });

  it('ignores a stale legacy flat-path file when an active prefix is pinned, serving the active candidate instead', async () => {
    // Regression: a course migrated from the pre-versioning flat layout to
    // the candidate/Quality-Gate system keeps its old lms/scorm/{empresa}/
    // {curso}/index.html object in R2 forever. Before this fix, the direct-
    // key check ran before the activePrefix check, so that leftover file
    // silently outranked the actually-active candidate — confirmed live on
    // 9 production courses right after their first activation.
    const bucket = createMultiCandidateBucket({ legacyFlatCopy: true });
    const env = makeEnv(bucket, ACTIVE_PREFIX);

    const res = await getAsset(`/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/index.html`, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-LMS-Asset-Key')).toBe(`${ACTIVE_PREFIX}index.html`);
    expect(res.headers.get('X-LMS-Asset-Key')).not.toBe(`lms/scorm/${EMPRESA_ID}/${CURSO_ID}/index.html`);
  });

  it('preserves legacy listing-fallback behavior for courses with no versioned candidate prefix set', async () => {
    const bucket = createMultiCandidateBucket({ legacyFlatCopy: true });
    const env = makeEnv(bucket, null);

    const res = await getAsset(`/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/index.html`, env);

    expect(res.status).toBe(200);
    expect(res.headers.get('X-LMS-Asset-Key')).toBe(`lms/scorm/${EMPRESA_ID}/${CURSO_ID}/index.html`);
  });

  it('a request that already carries the exact active-candidate path in the wildcard resolves directly without touching list()', async () => {
    const bucket = createMultiCandidateBucket();
    const env = makeEnv(bucket, ACTIVE_PREFIX);

    const res = await getAsset(
      `/api/lms/scorm/assets/${EMPRESA_ID}/${CURSO_ID}/_candidates/7503f97e-active/app.js`,
      env,
    );

    expect(res.status).toBe(200);
    expect(bucket.list).not.toHaveBeenCalled();
  });
});
