import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';
import type { Env } from '../../types';

function dbForIncompleteScorm() {
  return {
    prepare: vi.fn(() => {
      const result = {
        first: async () => ({
          id: 696,
          empresa_id: 6,
          funcionario_id: 69,
          status: 'EM_ANDAMENTO',
          progresso_pct: 100,
          qualificacao_historico_id: null,
          curso_id: 39,
          tipo_conteudo: 'scorm',
          ativo: 1,
          publicado: 1,
          scorm_mastery_score: 70,
          scorm_package_r2_prefix: 'lms/scorm/6/39/package/',
          scorm_launch_file: 'index.html',
          gerar_qualificacao_ao_concluir: 1,
          lesson_status: 'incomplete',
          completion_status: null,
          success_status: null,
          score_raw: 100,
          score_min: 0,
          score_max: 100,
          score_scaled: null,
          session_time: '00:10:00',
          total_time: '01:00:00',
          suspend_data: '{"module":1}',
          cmi_json: '{"cmi.core.lesson_location":"12/55"}',
          xapi_count: 0,
        }),
      };
      return { ...result, bind: () => result };
    }),
  } as unknown as D1Database;
}

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 6 as never);
    c.set('userId' as never, 60 as never);
    c.set('userRole' as never, 'ADMINISTRADOR' as never);
    const guarded = await enforceLmsCompletionIntegrity(c as never);
    if (guarded) return guarded;
    return next();
  });
  app.patch('/api/lms/matriculas/:id/status', (c) => c.json({ success: true }));
  return app;
}

describe('LMS administrative completion integrity', () => {
  it('accepts governed admin completion when real SCORM progress/score exist but terminal status is incomplete', async () => {
    const response = await makeApp().fetch(
      new Request('http://localhost/api/lms/matriculas/696/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'CONCLUIDO',
          observacoes: 'Correção administrativa de incidente SCORM com evidência preservada.',
        }),
      }),
      { DB: dbForIncompleteScorm() } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
  });

  it('still rejects the same incomplete SCORM completion without a meaningful reason', async () => {
    const response = await makeApp().fetch(
      new Request('http://localhost/api/lms/matriculas/696/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'CONCLUIDO', observacoes: 'curto' }),
      }),
      { DB: dbForIncompleteScorm() } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'ADMINISTRATIVE_REASON_REQUIRED',
    });
  });
});
