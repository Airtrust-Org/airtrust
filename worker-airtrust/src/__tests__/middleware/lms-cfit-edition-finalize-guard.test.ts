import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

vi.mock('../../middleware/rbac', () => ({ hasRole: () => true }));
vi.mock('../../lib/lms/lms-asset-session', () => ({
  readCourseAssetSessionPayload: vi.fn(async () => null),
  assetSessionMatchesEnrollment: vi.fn(() => false),
}));
import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';

const row = {
  id: 842, empresa_id: 6, funcionario_id: 77, curso_id: 119,
  status: 'EM_ANDAMENTO', progresso_pct: 99, qualificacao_historico_id: null,
  tipo_conteudo: 'scorm', ativo: 1, publicado: 1,
  scorm_mastery_score: 80, scorm_assessment_policy: 'SCORED',
  scorm_package_r2_prefix: 'lms/scorm/6/119/_candidates/active/',
  scorm_launch_file: 'index.html', gerar_qualificacao_ao_concluir: 1,
  lesson_status: 'passed', completion_status: 'completed', success_status: 'passed',
  score_raw: 100, score_min: 0, score_max: 100, score_scaled: null,
  session_time: '01:00:00', total_time: '04:00:00', suspend_data: null,
  cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '41/41',
    'airtrust.total_slides': 41,
    'airtrust.viewed_slides': Array.from({ length: 41 }, (_, i) => i + 1) }),
  xapi_count: 0,
};

async function attempt(url: string, body?: unknown, activeTotal = 37) {
  const db = {
    prepare: vi.fn(() => ({
      bind: (..._args: unknown[]) => ({ first: async () => row }),
    })),
  } as unknown as D1Database;
  const bucket = {
    get: vi.fn(async () => ({
      size: 1000,
      text: async () => JSON.stringify({
        content: { requiredSlides: Array.from({ length: activeTotal }, (_, i) => `slide-${i}`) },
      }),
    })),
  } as unknown as R2Bucket;
  let downstreamCalled = false;
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (ctx, next) => {
    ctx.set('empresaId' as never, 6 as never);
    ctx.set('userId' as never, 42 as never);
    ctx.set('funcionarioId' as never, 77 as never);
    const rejected = await enforceLmsCompletionIntegrity(ctx as never);
    if (rejected) return rejected;
    return next();
  });
  app.post('*', (c) => {
    downstreamCalled = true;
    return c.json({ success: true });
  });
  const res = await app.fetch(new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }), { DB: db, BUCKET: bucket } as Env, {} as ExecutionContext);
  return { res, downstreamCalled };
}

describe('CFIT: edition mismatch prohibits canonical completion', () => {
  it('blocks manual finalize despite 41/41, persisted passed and score 100', async () => {
    const { res, downstreamCalled } = await attempt('/api/lms/matriculas/842/finalizar');
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: 'LMS_NEW_EDITION_REQUIRED',
      data: { edition_mismatch: { previous_total: 41, active_total: 37 } },
    });
    expect(downstreamCalled).toBe(false);
  });

  it('blocks forged terminal SCORM commit from old 41/41', async () => {
    const { res, downstreamCalled } = await attempt('/api/lms/matriculas/scorm/commit', {
      matricula_id: 842, lesson_status: 'passed', completion_candidate: true,
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: 'LMS_NEW_EDITION_REQUIRED',
    });
    expect(downstreamCalled).toBe(false);
  });
});
