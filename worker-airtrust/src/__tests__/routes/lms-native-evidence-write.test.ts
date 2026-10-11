import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const mock = vi.hoisted(() => ({
  loadPrivate: vi.fn(),
  checkpoint: vi.fn(),
  attempt: vi.fn(),
  start: vi.fn(),
}));
vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: {
    req: { header(name: string): string | undefined };
    set(key: string, value: unknown): void;
    json(body: unknown, status: 401): Response;
  }, next: () => Promise<void>) => {
    const user = c.req.header('x-test-user');
    const tenant = c.req.header('x-test-tenant');
    if (!user || !tenant) return c.json({ success: false, code: 'UNAUTHORIZED' }, 401);
    c.set('userId', Number(user));
    c.set('empresaId', Number(tenant));
    await next();
  },
}));
vi.mock('../../services/lms-native-content-loader', async (original) => {
  const mod = await original<typeof import('../../services/lms-native-content-loader')>();
  return { ...mod, loadNativePrivateCourse: mock.loadPrivate };
});
vi.mock('../../services/lms-native-checkpoint-writer', async (original) => {
  const mod = await original<typeof import('../../services/lms-native-checkpoint-writer')>();
  return { ...mod, commitNativeLessonCheckpoint: mock.checkpoint };
});
vi.mock('../../services/lms-native-attempt-writer', async (original) => {
  const mod = await original<typeof import('../../services/lms-native-attempt-writer')>();
  return { ...mod, commitNativeAssessmentAttempt: mock.attempt };
});
vi.mock('../../services/lms-native-enrollment-starter', async (original) => {
  const mod = await original<typeof import('../../services/lms-native-enrollment-starter')>();
  return { ...mod, startNativeEnrollment: mock.start };
});
import nativeRoutes from '../../routes/lms-native';

const sha = 'a'.repeat(64);
const lesson = { eventId: 'visit-first-001', sequence: 1, unitId: 'opening' };
const answers = [{ questionId: 'exam-question-001', optionId: 'option-2' }];

function app() {
  const parent = new Hono<{ Bindings: Env }>();
  parent.route('/api/lms/native', nativeRoutes);
  return parent;
}
function request(options: {
  mode?: 'checkpoint' | 'attempt' | 'start';
  environment?: string;
  preview?: string;
  writes?: string;
  tenant?: number;
  user?: number;
  anonymous?: boolean;
  matricula?: string;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
} = {}) {
  const {
    mode = 'checkpoint', environment = 'staging', preview = '6', writes = '6',
    tenant = 6, user = 900, anonymous = false, matricula = '101',
  } = options;
  const headers: Record<string, string> = {};
  if (!anonymous) {
    headers['x-test-user'] = String(user);
    headers['x-test-tenant'] = String(tenant);
  }
  headers['content-type'] = options.contentType ?? 'application/json';
  const url = 'http://localhost/api/lms/native/matriculas/' + matricula +
    (mode === 'checkpoint' ? '/checkpoints' : mode === 'start' ? '/iniciar' : '/tentativas');
  return app().fetch(new Request(url, {
    method: 'POST', headers,
    body: options.rawBody ?? JSON.stringify(options.body ?? (mode === 'checkpoint'
      ? lesson : mode === 'start' ? {} : { attemptNumber: 1, answers })),
  }), {
    ENVIRONMENT: environment,
    NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: preview,
    NATIVE_LEARNER_WRITE_ENABLED_TENANTS: writes,
    DB: {} as D1Database,
    BUCKET: {} as R2Bucket,
  } as unknown as Env);
}

describe('Native staging guarded checkpoint + private assessment HTTP APIs', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mock.loadPrivate.mockResolvedValue({
      artifact: { schema: 'AIRTRUST_NATIVE_COURSE_V1' },
      editionHash: sha, cicloId: 11, cursoId: 31, mode: 'LEARN',
    });
    mock.checkpoint.mockResolvedValue({
      state: 'APPLIED', committedSequence: 1, editionHash: sha,
    });
    mock.start.mockResolvedValue({ state: 'STARTED', cicloId: 11, editionHash: sha });
    mock.attempt.mockResolvedValue({
      state: 'APPLIED', attemptNumber: 1, editionHash: sha,
      scorePct: 50, assessmentSatisfied: false,
    });
  });

  it('denies both endpoints in production regardless of tenant allowlists', async () => {
    for (const mode of ['checkpoint','attempt','start'] as const) {
      const res = await request({ mode, environment: 'production' });
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ code: 'NATIVE_EVIDENCE_WRITE_NOT_ENABLED' });
    }
    expect(mock.loadPrivate).not.toHaveBeenCalled();
    expect(mock.checkpoint).not.toHaveBeenCalled();
    expect(mock.attempt).not.toHaveBeenCalled();
    expect(mock.start).not.toHaveBeenCalled();
  });

  it('requires BOTH exact staging tenant allowlists and refuses wildcard', async () => {
    for (const opts of [
      { preview: '', writes: '6' }, { preview: '6', writes: '' },
      { preview: '*', writes: '6' }, { preview: '6', writes: '*' },
      { preview: '60', writes: '6' }, { preview: '6', writes: '60' },
    ]) {
      expect((await request(opts)).status).toBe(404);
    }
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('requires the parent JWT auth before the write gate and refuses invalid IDs', async () => {
    expect((await request({ anonymous: true })).status).toBe(401);
    expect((await request({ matricula: '1e9' })).status).toBe(400);
    expect((await request({ user: 0 })).status).toBe(403);
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('starts only the authenticated pinned cycle with no qualification or certificate side effect', async () => {
    const res = await request({ mode: 'start' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, data: {
      state: 'STARTED', ciclo_id: 11, edition_sha256: sha, completion_supported: false,
    } });
    expect(mock.start).toHaveBeenCalledWith({
      db: expect.anything(), actorUserId: 900, empresaId: 6,
      matriculaId: 101, cursoId: 31, cicloId: 11, editionHash: sha,
    });
    expect(mock.checkpoint).not.toHaveBeenCalled();
    expect(mock.attempt).not.toHaveBeenCalled();
  });

  it('returns idempotent start only after the server validates the same edition', async () => {
    mock.start.mockResolvedValueOnce({ state: 'ALREADY_STARTED', cicloId: 11, editionHash: sha });
    const res = await request({ mode: 'start' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: { state: 'ALREADY_STARTED', completion_supported: false },
    });
  });

  it('refuses client-controlled Native start metadata', async () => {
    for (const body of [
      { matriculaId: 102 }, { status: 'CONCLUIDO' }, { score_pct: 100 },
      { empresaId: 7 }, { cicloId: 12 }, { editionHash: sha },
    ]) {
      expect((await request({ mode: 'start', body })).status).toBe(400);
    }
    expect(mock.start).not.toHaveBeenCalled();
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('pins checkpoint scope exclusively to authenticated user and private D1/R2 edition', async () => {
    const res = await request({ preview: '5, 6, 7', writes: '6' });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ success: true, data: {
      state: 'APPLIED', committed_sequence: 1,
      edition_sha256: sha, completion_supported: false,
    } });
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(mock.loadPrivate).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 6, matriculaId: 101, actorUserId: 900,
    }));
    expect(mock.checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 900,
      scope: { empresaId: 6, matriculaId: 101, cursoId: 31, cicloId: 11, artifactHash: sha },
      event: { ...lesson, artifactHash: sha },
    }));
    expect(mock.attempt).not.toHaveBeenCalled();
  });

  it('persists server-computed grade receipt only; no answer key or LMS completion', async () => {
    const res = await request({ mode: 'attempt' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: {
      state: 'APPLIED', attempt_number: 1, edition_sha256: sha,
      score_pct: 50, assessment_satisfied: false, completion_supported: false,
    } });
    expect(JSON.stringify(body)).not.toContain('correctOptionId');
    expect(mock.attempt).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: 900, attemptNumber: 1, answers,
      scope: { empresaId: 6, matriculaId: 101, cursoId: 31, cicloId: 11, artifactHash: sha },
    }));
  });

  it('refuses client-supplied scope, score, completion and gabarito claims', async () => {
    for (const body of [
      { ...lesson, empresaId: 7 },
      { ...lesson, artifactHash: 'b'.repeat(64) },
      { ...lesson, scorePct: 100 },
      { ...lesson, sequence: 0 },
    ]) expect((await request({ body })).status).toBe(400);
    for (const body of [
      { attemptNumber: 1, answers, scorePct: 100 },
      { attemptNumber: 1, answers, completed: true },
      { attemptNumber: 1, answers: [{ ...answers[0], correctOptionId: 'option-2' }] },
      { attemptNumber: 501, answers },
    ]) expect((await request({ mode: 'attempt', body })).status).toBe(400);
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('rejects malformed and oversized input before private R2 access', async () => {
    expect((await request({ rawBody: '{broken' })).status).toBe(400);
    expect((await request({ rawBody: 'x'.repeat(130000) })).status).toBe(400);
    expect((await request({ contentType: 'text/plain' })).status).toBe(400);
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('rejects over-limit streaming JSON when Content-Length is absent', async () => {
    let canceled = false;
    let consumed = 0;
    const bytes = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        consumed++;
        controller.enqueue(bytes.encode(' '.repeat(65_537)));
        if (consumed === 4) controller.close();
      },
      cancel() { canceled = true; },
    });
    const res = await app().fetch(new Request(
      'http://localhost/api/lms/native/matriculas/101/checkpoints', {
        method: 'POST',
        headers: { 'x-test-user': '900', 'x-test-tenant': '6', 'content-type': 'application/json' },
        body: stream,
        duplex: 'half',
      } as RequestInit,
    ), {
      ENVIRONMENT: 'staging',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: '6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS: '6',
      DB: {} as D1Database,
      BUCKET: {} as R2Bucket,
    } as unknown as Env);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'NATIVE_INVALID_INPUT' });
    expect(consumed).toBeLessThanOrEqual(3);
    expect(canceled).toBe(true);
    expect(mock.loadPrivate).not.toHaveBeenCalled();
  });

  it('parses a valid JSON body delivered as separate UTF-8 chunks', async () => {
    const pieces = ['{ "eventId": "visit-first-001",', ' "sequence": 1,', ' "unitId": "opening" }'];
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const piece = pieces.shift();
        if (piece) controller.enqueue(new TextEncoder().encode(piece));
        else controller.close();
      },
    });
    const res = await app().fetch(new Request(
      'http://localhost/api/lms/native/matriculas/101/checkpoints', {
        method: 'POST',
        headers: { 'x-test-user': '900', 'x-test-tenant': '6', 'content-type': 'application/json' },
        body: stream,
        duplex: 'half',
      } as RequestInit,
    ), {
      ENVIRONMENT: 'staging',
      NATIVE_LEARNER_PREVIEW_ENABLED_TENANTS: '6',
      NATIVE_LEARNER_WRITE_ENABLED_TENANTS: '6',
      DB: {} as D1Database,
      BUCKET: {} as R2Bucket,
    } as unknown as Env);
    expect(res.status).toBe(201);
    expect(mock.checkpoint).toHaveBeenCalledOnce();
  });

  it('is read-only for REVIEW sessions and does not write another attempt', async () => {
    mock.loadPrivate.mockResolvedValueOnce({
      artifact: {}, editionHash: sha, cursoId: 31, cicloId: 11, mode: 'REVIEW',
    });
    const res = await request({ mode: 'attempt' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'NATIVE_REVIEW_READ_ONLY' });
    expect(mock.attempt).not.toHaveBeenCalled();
  });

  it('returns idempotent replay but never claims a certificate', async () => {
    mock.checkpoint.mockResolvedValueOnce({
      state: 'IDEMPOTENT_REPLAY', committedSequence: 1, editionHash: sha,
    });
    const res = await request();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: {
      state: 'IDEMPOTENT_REPLAY', completion_supported: false,
    } });
  });

  it('sanitizes private artifact and database conflicts', async () => {
    const { NativeContentLoadError } = await import('../../services/lms-native-content-loader');
    mock.loadPrivate.mockRejectedValueOnce(
      new NativeContentLoadError('NATIVE_PUBLISHED_ARTIFACT_HASH_MISMATCH'));
    let res = await request();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'NATIVE_CONTENT_UNAVAILABLE' });
    const { NativeAttemptWriteError } = await import('../../services/lms-native-attempt-writer');
    mock.attempt.mockRejectedValueOnce(new NativeAttemptWriteError('NATIVE_ATTEMPT_REPLAY_CONFLICT'));
    res = await request({ mode: 'attempt' });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'NATIVE_EVIDENCE_CONFLICT' });
  });
});
