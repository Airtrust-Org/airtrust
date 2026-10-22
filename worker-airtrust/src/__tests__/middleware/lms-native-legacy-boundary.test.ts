import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';
import type { Env } from '../../types';

const nativeEnrollment = {
  id: 696,
  empresa_id: 6,
  funcionario_id: 69,
  status: 'EM_ANDAMENTO',
  progresso_pct: 100,
  ultimo_slide: 20,
  ultima_pagina: 20,
  data_inicio: '2026-10-10',
  qualificacao_historico_id: null,
  curso_id: 39,
  tipo_conteudo: 'native',
  ativo: 1,
  publicado: 1,
  scorm_mastery_score: null,
  scorm_assessment_policy: 'SCORED',
  scorm_package_r2_prefix: null,
  scorm_launch_file: null,
  gerar_qualificacao_ao_concluir: 0,
  lesson_status: 'passed',
  completion_status: 'completed',
  success_status: 'passed',
  score_raw: 100,
  score_min: 0,
  score_max: 100,
  score_scaled: 1,
  session_time: null,
  total_time: null,
  suspend_data: null,
  cmi_json: null,
  xapi_count: 0,
};

function mockDatabase(overrides: Partial<typeof nativeEnrollment> = {}) {
  return {
    prepare: vi.fn(() => {
      const result = { first: async () => ({ ...nativeEnrollment, ...overrides }) };
      return { ...result, bind: () => result };
    }),
    batch: vi.fn(() => {
      throw new Error('MUST_NOT_WRITE_NATIVE_WITH_LEGACY_PROGRESS');
    }),
  } as unknown as D1Database;
}

function testApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', async (c, next) => {
    c.set('empresaId' as never, 6 as never);
    c.set('userId' as never, 60 as never);
    c.set('userRole' as never, 'ADMINISTRADOR' as never);
    const response = await enforceLmsCompletionIntegrity(c as never);
    if (response) return response;
    await next();
  });
  for (const path of ['/api/lms/matriculas/:id/finalizar', '/api/lms/matriculas/scorm/commit',
    '/api/lms/xapi/statements', '/api/lms/matriculas/:id/rematricular',
    '/api/lms/matriculas/:id/reverter']) app.post(path, (c) => c.json({ success: true, bypassed: true }));
  for (const path of ['/api/lms/matriculas/:id/status', '/api/lms/matriculas/:id/progresso']) {
    app.patch(path, (c) => c.json({ success: true, bypassed: true }));
  }
  return app;
}

async function exercise(path: string, method: 'POST' | 'PATCH', body: Record<string, unknown>,
  overrides: Partial<typeof nativeEnrollment> = {}) {
  const db = mockDatabase(overrides);
  const response = await testApp().fetch(
    new Request('http://localhost' + path, {
      method, headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { DB: db } as unknown as Env,
    {} as ExecutionContext,
  );
  return { response, db };
}


describe('Native catalog activation marker blocks old endpoints even while physical type is SCORM', () => {
  const physicalScorm = { ...nativeEnrollment, tipo_conteudo: 'scorm' };
  const markedDb = (status = 'EM_ANDAMENTO') => {
    const prepare = vi.fn((sql: string) => {
      const first = vi.fn(async () => sql.includes('lms_native_catalog_activation')
        ? { curso_id: 39 }
        : { ...physicalScorm, status });
      const bind = vi.fn(() => ({ first }));
      return { bind, first };
    });
    const db = { prepare, batch: vi.fn(() => {
      throw new Error('MUST_NOT_WRITE_MARKED_NATIVE_AS_SCORM');
    }) } as unknown as D1Database;
    return { db, prepare };
  };


  it.each([
    ['/api/lms/matriculas/696/rematricular', 'CANCELADO',
      { reason: 'Rematrícula Native não usa SCORM.' }],
    ['/api/lms/matriculas/696/reverter', 'CONCLUIDO',
      { reason: 'Reversão Native exige trilha auditável própria.', classification: 'CORRECAO' }],
  ] as const)('blocks activated Native lifecycle mutation at %s', async (path, status, body) => {
    const { db, prepare } = markedDb(status);
    const response = await testApp().fetch(new Request('http://localhost' + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), {
      DB: db, ENVIRONMENT: 'staging', NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6',
    } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_LEGACY_LIFECYCLE_DENIED' });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes('lms_native_catalog_activation'))).toBe(true);
    expect(db.batch).not.toHaveBeenCalled();
  });
  it.each([
    ['/api/lms/matriculas/696/finalizar', 'POST', {}],
    ['/api/lms/matriculas/scorm/commit', 'POST',
      { matricula_id: 696, completion_candidate: true, lesson_status: 'passed' }],
    ['/api/lms/xapi/statements', 'POST',
      { matricula_id: 696, completion_intent: 'USER_CONFIRMED',
        verb: { id: 'https://w3id.org/xapi/adl/verbs/completed' } }],
    ['/api/lms/matriculas/696/status', 'PATCH', { status: 'EM_ANDAMENTO' }],
    ['/api/lms/matriculas/696/progresso', 'PATCH', { progresso_pct: 40 }],
  ] as const)('rejects marked Native on %s without legacy database writes', async (path, method, body) => {
    const { db, prepare } = markedDb();
    const app = testApp();
    const response = await app.fetch(new Request('http://localhost' + path, {
      method, headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), {
      DB: db,
      ENVIRONMENT: 'staging',
      NATIVE_CATALOG_ACTIVATION_READ_ENABLED_TENANTS: '6',
    } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: path.endsWith('/progresso')
        ? 'NATIVE_CHECKPOINT_REQUIRED' : 'NATIVE_CANONICAL_EVIDENCE_REQUIRED',
    });
    expect(prepare.mock.calls.some(([sql]) => String(sql).includes('lms_native_catalog_activation'))).toBe(true);
    expect(db.batch).not.toHaveBeenCalled();
  });
});

describe('Native LMS must never enter an old completion/progress endpoint', () => {
  it('blocks legacy manual finalize, even with 100 percent progress and passed runtime fields', async () => {
    const { response, db } = await exercise('/api/lms/matriculas/696/finalizar', 'POST', {});
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_CANONICAL_EVIDENCE_REQUIRED' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('blocks direct administrative conclusion even with a privileged actor', async () => {
    const { response, db } = await exercise('/api/lms/matriculas/696/status', 'PATCH', {
      status: 'CONCLUIDO', observacoes: 'Finalização administrativa com evidências aparentemente completas.',
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_CANONICAL_EVIDENCE_REQUIRED' });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('blocks forged SCORM completion for a Native enrollment', async () => {
    const { response } = await exercise('/api/lms/matriculas/scorm/commit', 'POST', {
      matricula_id: 696, lesson_status: 'passed', completion_status: 'completed',
      completion_candidate: true, score_raw: 100,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_CANONICAL_EVIDENCE_REQUIRED' });
  });

  it('blocks forged xAPI completion for Native, even with USER_CONFIRMED', async () => {
    const { response } = await exercise('/api/lms/xapi/statements', 'POST', {
      matricula_id: 696, completion_intent: 'USER_CONFIRMED',
      verb: { id: 'https://w3id.org/xapi/adl/verbs/completed' },
      result: { completion: true, score: { raw: 100, max: 100 } },
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_CANONICAL_EVIDENCE_REQUIRED' });
  });


  it.each([
    ['/api/lms/matriculas/696/rematricular', 'CANCELADO',
      { reason: 'Rematrícula somente pelo contrato Native.' }],
    ['/api/lms/matriculas/696/reverter', 'CONCLUIDO',
      { reason: 'Invalidação precisa preservar evidências Native.', classification: 'CORRECAO' }],
  ] as const)('blocks physical Native lifecycle mutation at %s', async (path, status, body) => {
    const { response, db } = await exercise(path, 'POST', body, { status });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_LEGACY_LIFECYCLE_DENIED' });
    expect(db.batch).not.toHaveBeenCalled();
  });
  it('rejects browser-authored 100 percent legacy progress without DB writes', async () => {
    const { response, db } = await exercise('/api/lms/matriculas/696/progresso', 'PATCH', {
      progresso_pct: 100, ultimo_slide: 20,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'NATIVE_CHECKPOINT_REQUIRED' });
    expect(db.batch).not.toHaveBeenCalled();
  });
});


describe('administrative SCORM recovery never reinterprets Native evidence', () => {
  it('checks effective course type on dry-run, apply and rollback before mutation', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const source = readFileSync(resolve(process.cwd(), 'src/routes/lms-matriculas.ts'), 'utf8');
    for (const endpoint of ['dry-run', 'apply', 'rollback']) {
      const start = source.indexOf("app.post('/:id/progresso-recuperacao/" + endpoint + "'");
      const end = source.indexOf("\napp.", start + 10);
      const body = source.slice(start, end < 0 ? undefined : end);
      const loadAt = body.indexOf('loadProgressRecoveryEnrollment(db, matriculaId, empresaId)');
      const nativeAt = body.indexOf('isNativeForLegacyLmsPath(c.env, empresaId, enrollment.curso_id, enrollment.tipo_conteudo)');
      expect(loadAt).toBeGreaterThan(0);
      expect(nativeAt).toBeGreaterThan(loadAt);
      expect(body).toContain('NATIVE_SCORM_RECOVERY_DENIED');
      expect(nativeAt).toBeLessThan(body.indexOf("if (!enrollment)") + 370);
      if (endpoint === 'apply') expect(nativeAt).toBeLessThan(body.indexOf("action: 'LMS_PROGRESS_RECOVERY_APPLY'"));
      if (endpoint === 'rollback') expect(nativeAt).toBeLessThan(body.indexOf('const auditLog = await db'));
    }
  });
});
