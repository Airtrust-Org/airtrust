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

async function attempt(
  url: string, body?: unknown, activeTotal = 37, method = 'POST',
  edition?: { savedCmi: string; activeVersion: string },
) {
  const db = {
    prepare: vi.fn(() => ({
      bind: (..._args: unknown[]) => ({ first: async () => edition ? { ...row, cmi_json: edition.savedCmi } : row }),
    })),
  } as unknown as D1Database;
  const bucket = {
    get: vi.fn(async () => ({
      size: 1000,
      text: async () => JSON.stringify({
        ...(edition ? { packageVersion: edition.activeVersion } : {}),
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
  app.all('*', (c) => {
    downstreamCalled = true;
    return c.json({ success: true });
  });
  const res = await app.fetch(new Request(`http://localhost${url}`, {
    method,
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

  it('blocks administrative PATCH completion of obsolete 41/41', async () => {
    const { res, downstreamCalled } = await attempt(
      '/api/lms/matriculas/842/status',
      { status: 'CONCLUIDO', observacoes: 'Administratively complete this course' },
      37, 'PATCH',
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: 'LMS_NEW_EDITION_REQUIRED',
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
  it('rejects direct terminal API after same-length edition replacement (35/46, old mgo-v14 vs new mgo-v15)', async () => {
    const savedCmi = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'airtrust.total_slides': 46,
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'mgo-v14', a: 34, d: [0, 1] }),
    });
    const { res, downstreamCalled } = await attempt(
      '/api/lms/matriculas/scorm/commit',
      { matricula_id: 842, lesson_status: 'passed', completion_candidate: true },
      46,
      'POST',
      { savedCmi, activeVersion: 'mgo-v15' },
    );
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      code: 'LMS_NEW_EDITION_REQUIRED',
      data: { edition_mismatch: { reason: 'PACKAGE_VERSION_CHANGED', previous_total: 46, active_total: 46 } },
    });
    expect(downstreamCalled).toBe(false);
  });

});
