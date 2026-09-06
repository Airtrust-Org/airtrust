/**
 * GET /api/lms/course-assets/:cursoId/thumbnail
 *
 * Found while investigating the 2026-08-10 SCORM upload incident: the
 * catalog page (LmsCatalogo/LmsAdminCursos) loads course thumbnails through
 * this route. Two bugs found in passing while fixing the CORS block on the
 * upload flow:
 *
 * 1. Tenant isolation: the query had no `empresa_id` filter at all — any
 *    authenticated user, from any tenant, could fetch any other tenant's
 *    course thumbnail by guessing the numeric course id.
 * 2. CORS: the response hardcoded `Access-Control-Allow-Origin: *`, which
 *    browsers reject once the request is made with credentials (as
 *    fetchWithAuth does), so thumbnails silently failed to load in
 *    production for every tenant.
 */
import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
  validateAccessTokenSecurityState: vi.fn(async (_db: unknown, payload: { role?: string }) => ({
    role: payload.role || 'USUARIO',
  })),
}));

vi.mock('../../config/allowed-origins', () => ({
  resolveAllowedOrigin: (origin: string | undefined) => origin ?? 'null',
}));

import lmsAssetsRoutes from '../../routes/lms-assets';
import { errorHandler } from '../../middleware/error-handler';

const PROD_ORIGIN = 'https://airtrust.online';

function makeEnv() {
  const cursos: Record<
    number,
    { id: number; empresa_id: number; thumbnail_r2_key: string | null }
  > = {
    43: { id: 43, empresa_id: 6, thumbnail_r2_key: 'lms/course-thumbnails/6/43/logo.png' },
  };

  const DB = {
    prepare: vi.fn((query: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (query.includes('FROM lms_cursos')) {
            const [cursoId, boundEmpresaId] = args as [number, number];
            const curso = cursos[cursoId];
            if (!curso || curso.empresa_id !== boundEmpresaId) return null;
            return curso;
          }
          return null;
        },
      }),
    })),
  };

  const BUCKET = {
    get: vi.fn(async (key: string) => {
      if (key !== 'lms/course-thumbnails/6/43/logo.png') return null;
      return {
        httpEtag: '"abc"',
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
      };
    }),
  };

  return { DB, BUCKET } as unknown as Env & { __empresaId: number };
}

function app(empresaId: number) {
  const testApp = new Hono<{ Bindings: Env }>();
  testApp.use('*', async (c, next) => {
    c.set('empresaId' as never, empresaId as never);
    await next();
  });
  testApp.onError(errorHandler);
  testApp.route('/api/lms', lmsAssetsRoutes);
  return testApp;
}

describe('GET course-assets/:cursoId/thumbnail', () => {
  it('isolamento de tenant: outra empresa não acessa a thumbnail de um curso alheio', async () => {
    const env = makeEnv();
    const res = await app(7).request(
      '/api/lms/course-assets/43/thumbnail',
      { headers: { Origin: PROD_ORIGIN } },
      env,
    );
    expect(res.status).toBe(404);
  });

  it('empresa dona do curso recebe a thumbnail com CORS correto (não wildcard)', async () => {
    const env = makeEnv();
    const res = await app(6).request(
      '/api/lms/course-assets/43/thumbnail',
      { headers: { Origin: PROD_ORIGIN } },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(PROD_ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });
});
