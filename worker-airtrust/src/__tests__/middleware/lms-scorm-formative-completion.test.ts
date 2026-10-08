import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';
import type { Env } from '../../types';

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn(() => true) }));
vi.mock('../../lib/lms/lms-asset-session', () => ({
  readCourseAssetSessionPayload: vi.fn(async () => ({ token: 'test-only' })),
  assetSessionMatchesEnrollment: sessionMock,
}));

const baseRow = {
  id: 863,
  empresa_id: 6,
  funcionario_id: 69,
  status: 'EM_ANDAMENTO',
  progresso_pct: 99,
  qualificacao_historico_id: null,
  curso_id: 119,
  tipo_conteudo: 'scorm',
  ativo: 1,
  publicado: 1,
  scorm_assessment_policy: 'FORMATIVE',
  scorm_mastery_score: null,
  scorm_package_r2_prefix: 'lms/scorm/6/119/package/',
  scorm_launch_file: 'index.html',
  gerar_qualificacao_ao_concluir: 1,
  lesson_status: 'incomplete',
  completion_status: null,
  success_status: null,
  score_raw: null,
  score_min: null,
  score_max: null,
  score_scaled: null,
  session_time: '00:10:00',
  total_time: '03:58:00',
  suspend_data: '{"slide":44}',
  cmi_json: '{"cmi.core.lesson_location":"44/45"}',
  xapi_count: 0,
};

function makeApp(row = baseRow) {
  const db = {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({ first: async () => row })),
    })),
  } as unknown as D1Database;
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 6 as never);
    c.set('userId' as never, 60 as never);
    c.set('userRole' as never, 'ADMINISTRADOR' as never);
    const rejected = await enforceLmsCompletionIntegrity(c as never);
    if (rejected) return rejected;
    await next();
  });
  app.post('/api/lms/matriculas/scorm/commit', (c) => c.json({ success: true }));
  app.post('/api/lms/matriculas/:id/finalizar', (c) => c.json({ success: true }));
  return { app, db };
}

async function commit(row: typeof baseRow, incoming: Record<string, unknown>) {
  return makeApp(row).app.fetch(
    new Request('http://localhost/api/lms/matriculas/scorm/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ matricula_id: 863, ...incoming }),
    }),
    { DB: makeApp(row).db } as Env,
    {} as ExecutionContext,
  );
}

describe('LMS SCORM explicit formative completion (incident 863)', () => {
  beforeEach(() => sessionMock.mockReturnValue(true));

  it('accepts 45/45 formative completion without fabricated score when session and SCORM terminal exist', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'completed',
      completion_candidate: true,
      cmi_json: '{"cmi.core.lesson_location":"45/45"}',
    });
    expect(response.status).toBe(200);
  });

  it('accepts SCORM 1.2 passed status without a numeric score for an explicitly formative course', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'passed',
      cmi_json: '{"cmi.core.lesson_location":"45/45"}',
    });
    expect(response.status).toBe(200);
  });

  it('accepts the existing trusted SCORM 1.2 Finish proof with 45/45 when terminal status remains incomplete', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'incomplete',
      commit_event: 'SCORM_FINISH',
      completion_candidate: true,
      completion_observed_at: '2026-10-08T15:00:00.000Z',
      cmi_json: '{"cmi.core.lesson_location":"45/45"}',
    });
    expect(response.status).toBe(200);
  });

  it('rejects a spoofed candidate lacking a trusted SCORM Finish', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'incomplete',
      commit_event: 'SCORM_BEFORE_UNLOAD_COMMIT',
      completion_candidate: true,
      completion_observed_at: '2026-10-08T15:00:00.000Z',
      cmi_json: '{"cmi.core.lesson_location":"45/45"}',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'COMPLETION_EVIDENCE_INSUFFICIENT',
    });
  });

  it('keeps a graded qualifying course fail-closed without a score', async () => {
    const response = await commit({
      ...baseRow, scorm_assessment_policy: 'SCORED', scorm_mastery_score: 70,
    }, { lesson_status: 'completed', completion_candidate: true });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SCORE_MISSING' });
  });

  it('keeps legacy/unknown assessment policy fail-closed', async () => {
    const response = await commit({
      ...baseRow, scorm_assessment_policy: undefined as never, scorm_mastery_score: 70,
    }, { lesson_status: 'completed', completion_candidate: true });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'SCORE_MISSING' });
  });

  it('rejects a fake completion_candidate without terminal SCORM status', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'incomplete',
      completion_candidate: true,
      cmi_json: '{"cmi.core.lesson_location":"45/45"}',
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'COMPLETION_EVIDENCE_INSUFFICIENT',
    });
  });

  it('never converts SCORM failure into formative completion', async () => {
    const response = await commit(baseRow, {
      lesson_status: 'failed',
      completion_status: 'completed',
      completion_candidate: true,
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'EXPLICIT_FAILURE' });
  });

  it('rejects expired or mismatched asset session', async () => {
    sessionMock.mockReturnValue(false);
    const response = await commit(baseRow, { lesson_status: 'completed' });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'ASSET_SESSION_INVALID' });
  });

  it('rejects inactive enrollment despite a terminal event', async () => {
    const response = await commit(
      { ...baseRow, status: 'CANCELADO' }, { lesson_status: 'completed' },
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: 'ENROLLMENT_INACTIVE' });
  });

  it('rejects manual finalization based on 100% progress without terminal SCORM evidence', async () => {
    const { app, db } = makeApp({ ...baseRow, progresso_pct: 100 });
    const response = await app.fetch(
      new Request('http://localhost/api/lms/matriculas/863/finalizar', { method: 'POST' }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: 'COMPLETION_EVIDENCE_INSUFFICIENT',
    });
  });
});
