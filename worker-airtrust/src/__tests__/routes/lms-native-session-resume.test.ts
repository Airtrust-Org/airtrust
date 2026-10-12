import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const mock = vi.hoisted(() => ({
  loadPrivate: vi.fn(),
  readSession: vi.fn(),
}));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: {
    req: { header(name: string): string | undefined };
    set(key: string, value: unknown): void;
    json(body: unknown, status: 401): Response;
  }, next: () => Promise<void>) => {
    const user = c.req.header('x-test-user');
    const tenant = c.req.header('x-test-tenant');
    if (!user || !tenant) return c.json({ code: 'UNAUTHORIZED' }, 401);
    c.set('userId', Number(user));
    c.set('empresaId', Number(tenant));
    await next();
  },
}));
vi.mock('../../services/lms-native-content-loader', async (original) => {
  const real = await original<typeof import('../../services/lms-native-content-loader')>();
  return { ...real, loadNativePrivateCourse: mock.loadPrivate };
});
vi.mock('../../services/lms-native-readiness-repository', async (original) => {
  const real = await original<typeof import('../../services/lms-native-readiness-repository')>();
  return { ...real, readNativeLearnerSession: mock.readSession };
});

import nativeRoutes from '../../routes/lms-native';

const digest = 'b'.repeat(64);
function testApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/api/lms/native', nativeRoutes);
  return app;
}
function send(config: {
  environment?: string; allowlist?: string; matricula?: string;
  user?: number; tenant?: number; anonymous?: boolean;
  catalog?: string; write?: string; completion?: string;
} = {}) {
  const headers: Record<string, string> = {};
  if (!config.anonymous) {
    headers['x-test-user'] = String(config.user ?? 900);
    headers['x-test-tenant'] = String(config.tenant ?? 6);
  }
  return testApp().fetch(new Request(
    'http://localhost/api/lms/native/matriculas/' + (config.matricula ?? '101') + '/sessao',
    { headers },
  ), {
    ENVIRONMENT: config.environment ?? 'staging',
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: config.allowlist ?? '6',
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: config.write ?? '6',
    NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: config.catalog ?? '6',
    NATIVE_COMPLETION_WRITE_ENABLED_TENANTS: config.completion ?? '',
    DB: {} as D1Database, BUCKET: {} as R2Bucket,
  } as unknown as Env);
}

describe('Native resume snapshot endpoint — no grade secrets or completion', () => {
  beforeEach(() => {
    mock.loadPrivate.mockReset();
    mock.readSession.mockReset();
    mock.loadPrivate.mockResolvedValue({
      artifact: { schema: 'AIRTRUST_NATIVE_COURSE_V1', questions: [
        { id: 'q1', correctOptionId: 'SECRET', feedbackCorrect: 'NEVER EXPOSE' },
      ] },
      cursoId: 31, cicloId: 11, editionHash: digest, mode: 'LEARN',
    });
    mock.readSession.mockResolvedValue({
      summary: {
        editionHash: digest, cicloId: 11, mode: 'LEARN',
        nextSequence: 3, seenLessonIds: ['opening', 'module2'],
        lastVisitedUnitId: 'module2', totalLessons: 3,
        latestAttempt: { attemptNumber: 2, scorePct: 50, assessmentSatisfied: false },
      },
      readiness: { readyForCanonicalCompletion: false, reason: 'ASSESSMENT_NOT_SATISFIED' },
    });
  });

  it('returns only safe navigation evidence from pinned current-cycle enrollment', async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const data = await response.json();
    expect(data).toEqual({
      success: true,
      data: {
        matricula_id: 101, ciclo_id: 11, edition_sha256: digest, mode: 'LEARN',
        next_sequence: 3, seen_lesson_ids: ['opening', 'module2'],
        last_visited_unit_id: 'module2', total_lessons: 3,
        latest_attempt: { attempt_number: 2, score_pct: 50, assessment_satisfied: false },
        completion_supported: false,
      },
    });
    expect(JSON.stringify(data)).not.toContain('correctOptionId');
    expect(JSON.stringify(data)).not.toContain('SECRET');
    expect(JSON.stringify(data)).not.toContain('answers_json');
    expect(JSON.stringify(data)).not.toContain('readyForCanonicalCompletion');
    expect(mock.loadPrivate).toHaveBeenCalledWith(expect.objectContaining({
      matriculaId: 101, empresaId: 6, actorUserId: 900,
    }));
    expect(mock.readSession).toHaveBeenCalledWith(expect.objectContaining({
      scope: {
        empresaId: 6, matriculaId: 101, cursoId: 31, cicloId: 11, artifactHash: digest,
      },
    }));
  });

  it('fails closed for absent allowlist, another tenant and production', async () => {
    for (const config of [
      { allowlist: '' },
      { allowlist: '*' },
      { allowlist: '60' },
      { tenant: 60 },
      { environment: 'production', allowlist: '6' },
    ]) {
      expect((await send(config)).status).toBe(404);
    }
    expect(mock.loadPrivate).not.toHaveBeenCalled();
    expect(mock.readSession).not.toHaveBeenCalled();
  });

  it('requires authenticated user and valid numeric enrollment', async () => {
    expect((await send({ anonymous: true })).status).toBe(401);
    expect((await send({ user: 0 })).status).toBe(403);
    expect((await send({ matricula: '1e4' })).status).toBe(400);
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('supports review without ever enabling more writes', async () => {
    mock.readSession.mockResolvedValueOnce({
      summary: {
        editionHash: digest, cicloId: 11, mode: 'REVIEW', nextSequence: 2,
        seenLessonIds: ['opening'], lastVisitedUnitId: 'opening',
        totalLessons: 3, latestAttempt: null,
      },
      readiness: { readyForCanonicalCompletion: false, reason: 'NOT_ACTIVE' },
    });
    const response = await send();
    const json = await response.json() as { data: { mode: string; completion_supported: boolean } };
    expect(json.data.mode).toBe('REVIEW');
    expect(json.data.completion_supported).toBe(false);
  });

  it('advertises completion only when all fifth-gate requirements hold and learning remains active', async () => {
    for (const args of [{ completion:'' },{completion:'60'},{completion:'*'},
      { completion:'6',catalog:'' },{completion:'6',write:''}]) {
      const response=await send(args);
      expect((await response.json() as {data:{completion_supported:boolean}})
        .data.completion_supported).toBe(false);
    }
    const enabled=await send({completion:'6',catalog:'6',write:'6'});
    expect((await enabled.json() as {data:{completion_supported:boolean}})
      .data.completion_supported).toBe(true);
    mock.readSession.mockResolvedValueOnce({summary:{
      editionHash:digest,cicloId:11,mode:'REVIEW',nextSequence:2,seenLessonIds:['opening'],
      lastVisitedUnitId:'opening',totalLessons:3,latestAttempt:null,
    },readiness:{readyForCanonicalCompletion:false,reason:'NOT_ACTIVE'}});
    const review=await send({completion:'6',catalog:'6',write:'6'});
    expect((await review.json() as {data:{completion_supported:boolean}})
      .data.completion_supported).toBe(false);
  });

  it('hides private content and event corruption errors', async () => {
    const { NativeEvidenceReadError } = await import('../../services/lms-native-readiness-repository');
    mock.readSession.mockRejectedValueOnce(
      new NativeEvidenceReadError('NATIVE_READ_GRADE_RECONCILIATION_CONFLICT'));
    const response = await send();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false, code: 'NATIVE_SESSION_UNAVAILABLE',
    });
  });
});
