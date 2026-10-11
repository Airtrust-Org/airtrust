import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: {
    req: { header(name: string): string | undefined };
    set(key: string, value: unknown): void;
    json(body: unknown, status: 401): Response;
  }, next: () => Promise<void>) => {
    const user = c.req.header('x-test-user');
    const tenant = c.req.header('x-test-tenant');
    if (!user || !tenant) return c.json({ error: 'Unauthorized' }, 401);
    c.set('userId', Number(user));
    c.set('empresaId', Number(tenant));
    await next();
  },
}));
vi.mock('../../services/lms-native-content-loader', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/lms-native-content-loader')>();
  return { ...original, loadNativePublishedCourse: mocks.load };
});

import nativeRoutes from '../../routes/lms-native';

function app() {
  const root = new Hono<{ Bindings: Env }>();
  root.route('/api/lms/native', nativeRoutes);
  return root;
}
function fetchRoute(config: {
  environment?: string;
  allowlist?: string;
  path?: string;
  tenant?: number;
  user?: number;
  anonymous?: boolean;
} = {}) {
  const headers = config.anonymous ? {} : {
    'x-test-user': String(config.user ?? 900),
    'x-test-tenant': String(config.tenant ?? 6),
  };
  return app().fetch(new Request(
    'http://localhost/api/lms/native/matriculas/' + (config.path ?? '101') + '/curso',
    { headers },
  ), {
    ENVIRONMENT: config.environment ?? 'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: config.allowlist ?? '6',
    DB: {} as D1Database, BUCKET: {} as R2Bucket,
  } as unknown as Env);
}

describe('Native V1 staging-only content preview route', () => {
  beforeEach(() => {
    mocks.load.mockReset();
    mocks.load.mockResolvedValue({
      course: {
        schema: 'AIRTRUST_NATIVE_COURSE_V1', title: 'Curso demonstrativo',
        questions: [{ id: 'q1', prompt: 'Conduta?', options: [{ id: 'x', text: 'Sim' }] }],
      },
      editionHash: 'a'.repeat(64), cicloId: 800, mode: 'LEARN',
    });
  });

  it('fails closed by default when allowlist is absent or empty', async () => {
    for (const allowlist of ['', '*', '7']) {
      const r = await fetchRoute({ allowlist });
      expect(r.status).toBe(404);
      expect(await r.json()).toMatchObject({ code: 'NATIVE_PLAYER_NOT_ENABLED' });
    }
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('denies production even if tenant appears explicitly in allowlist', async () => {
    const r = await fetchRoute({ environment: 'production', allowlist: '6' });
    expect(r.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('permits only the exact tenant, rejects close IDs and wildcard', async () => {
    const r = await fetchRoute({ tenant: 60, allowlist: '6' });
    expect(r.status).toBe(404);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('requires auth before any Native course lookup', async () => {
    const r = await fetchRoute({ anonymous: true });
    expect(r.status).toBe(401);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('rejects malformed IDs before content/storage access', async () => {
    const r = await fetchRoute({ path: '1e9' });
    expect(r.status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('returns no-store sanitized learner projection and cannot mark completed', async () => {
    const r = await fetchRoute({ allowlist: '5, 6, 7' });
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('no-store');
    const data = await r.json() as { data: { matricula_id: number; ciclo_id: number;
      edition_sha256: string; course: { questions: unknown[] }; completion_supported: boolean } };
    expect(data.data.matricula_id).toBe(101);
    expect(data.data.ciclo_id).toBe(800);
    expect(data.data.completion_supported).toBe(false);
    expect(JSON.stringify(data)).not.toContain('correctOptionId');
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 900, empresaId: 6, matriculaId: 101,
    }));
  });

  it('does not expose private error cause if native publication fails', async () => {
    const { NativeContentLoadError } = await import('../../services/lms-native-content-loader');
    mocks.load.mockRejectedValueOnce(new NativeContentLoadError('NATIVE_PUBLISHED_ARTIFACT_HASH_MISMATCH'));
    const r = await fetchRoute();
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ success: false, code: 'NATIVE_CONTENT_UNAVAILABLE' });
  });
});
