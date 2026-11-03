import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: any, next: () => Promise<void>) => {
    const empresaId = Number(c.env?.__mockEmpresaId ?? 6);
    c.set('userId', Number(c.env?.__mockUserId ?? 500));
    c.set('userRole', c.env?.__mockRole ?? 'student');
    c.set('empresaId', empresaId);
    c.set('tenantContext', {
      empresaId, empresaCodigo: 'emp', empresaNome: 'Empresa', role: c.env?.__mockRole ?? 'student',
      plano: 'pro', permissions: ['*'],
    });
    await next();
  },
}));

import { Hono } from 'hono';
import learnerRoutes from '../../routes/lms-exam-learner';
import adminRoutes from '../../routes/lms-exam-question-bank-admin';
import { OTHER_USER, PKG, externalBucket, lmsExamDb, publishExam } from '../helpers/exam-lms-fixture';

const app = new Hono();
// The real app maps ApiError (RBAC, auth) through its global handler.
app.onError((e, c) => c.json({ code: (e as { code?: string }).code ?? 'ERROR' },
  ((e as { statusCode?: number }).statusCode ?? 500) as 403));
app.route('/api/lms/exams/admin', adminRoutes);
app.route('/api/lms/exams', learnerRoutes);

function call(db: ReturnType<typeof lmsExamDb>, path: string, init: RequestInit = {}, over: Record<string, unknown> = {}) {
  const env = {
    DB: db.asD1(), BUCKET: externalBucket(), ENVIRONMENT: 'staging',
    LMS_EXAM_LEARNER_STAGING: 'REVIEWED_SCHEMA_ONLY', LMS_EXAM_QUESTION_ADMIN_STAGING: 'REVIEWED_SCHEMA_ONLY',
    ...over,
  };
  return app.fetch(new Request('https://t.local' + path, init), env as never);
}
const json = (method: string, body?: unknown, headers: Record<string, string> = {}) => ({
  method, headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe('rotas do aluno — prova externa', () => {
  it('desligadas por padrão: 503 fora de staging ou sem a flag', async () => {
    const db = lmsExamDb(); await publishExam(db);
    expect((await call(db, '/api/lms/exams/matriculas/10/prova', {}, { ENVIRONMENT: 'production' })).status).toBe(503);
    expect((await call(db, '/api/lms/exams/matriculas/10/prova', {}, { LMS_EXAM_LEARNER_STAGING: undefined })).status).toBe(503);
  });
  it('fluxo completo: estado → iniciar (idempotente) → responder → enviar → aprovado → finalizar', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const state = await (await call(db, '/api/lms/exams/matriculas/10/prova')).json() as any;
    expect(state.data).toMatchObject({ state: 'READY', finalizeRequired: false });

    const noKey = await call(db, '/api/lms/exams/matriculas/10/tentativas', json('POST'));
    expect(noKey.status).toBe(422);
    const h = { 'Idempotency-Key': 'idem-route-0001' };
    const started = await call(db, '/api/lms/exams/matriculas/10/tentativas', json('POST', undefined, h));
    expect(started.status).toBe(201);
    const attempt = (await started.json() as any).data;
    expect(JSON.stringify(attempt)).not.toMatch(/correctChoiceId|explanation|SEGREDO/);
    const again = await (await call(db, '/api/lms/exams/matriculas/10/tentativas', json('POST', undefined, h))).json() as any;
    expect(again.data.attemptId).toBe(attempt.attemptId);
    // Returning to the course must offer resumption of the same saved attempt.
    const stillOpen = await (await call(db, '/api/lms/exams/matriculas/10/prova')).json() as any;
    expect(stillOpen.data).toMatchObject({ state: 'READY', hasOpenAttempt: true, attemptsUsed: 0 });

    const put = (qid: string, cid: string, over = {}) =>
      call(db, `/api/lms/exams/tentativas/${attempt.attemptId}/respostas`, json('PUT', { questionId: qid, choiceId: cid }), over);
    expect((await put('q99', 'o1')).status).toBe(422);
    expect((await put('q1', 'o1', { __mockUserId: OTHER_USER })).status).toBe(403);
    for (let i = 1; i <= 7; i++) expect((await put('q' + i, 'o1')).status).toBe(200);

    const sent = await call(db, `/api/lms/exams/tentativas/${attempt.attemptId}/enviar`, json('POST'));
    expect(sent.status).toBe(200);
    expect(((await sent.json()) as any).data.result).toMatchObject({ passed: true, answered: 7, unanswered: 3 });
    expect((await put('q8', 'o1')).status).toBe(409);

    const after = await (await call(db, '/api/lms/exams/matriculas/10/prova')).json() as any;
    expect(after.data).toMatchObject({ state: 'PASSED', finalizeRequired: true, hasOpenAttempt: false });
    // Idempotent replay of a sealed attempt must return the same verdict.
    const replay = await call(db, `/api/lms/exams/tentativas/${attempt.attemptId}/enviar`, json('POST'));
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as any).data.result.passed).toBe(true);
    const retry = await call(db, '/api/lms/exams/matriculas/10/tentativas', json('POST', undefined, { 'Idempotency-Key': 'idem-route-0002' }));
    expect(retry.status).toBe(409);
    expect(((await retry.json()) as any).code).toBe('EXAM_ALREADY_PASSED');
  });
  it('estudo incompleto não inicia tentativa e devolve só códigos de pendência', async () => {
    const db = lmsExamDb({ viewed: [1] }); await publishExam(db);
    const r = await call(db, '/api/lms/exams/matriculas/10/tentativas', json('POST', undefined, { 'Idempotency-Key': 'idem-route-0001' }));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ code: 'EXAM_STUDY_NOT_COMPLETE' });
  });
  it('não aceita respostas nem submissão após matrícula cancelada', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const started = await call(db, '/api/lms/exams/matriculas/10/tentativas',
      json('POST', undefined, { 'Idempotency-Key': 'idem-cancel-0001' }));
    const a = (await started.json() as any).data;
    db.exec("UPDATE lms_matriculas SET status='CANCELADO' WHERE id=10");
    expect((await (await call(db, '/api/lms/exams/matriculas/10/prova')).json() as any).data.state)
      .toBe('NOT_AVAILABLE');
    for (const [suffix, init] of [
      ['/respostas', json('PUT', { questionId: 'q1', choiceId: 'o1' })],
      ['/enviar', json('POST')],
    ] as const) {
      const denied = await call(db, `/api/lms/exams/tentativas/${a.attemptId}${suffix}`, init);
      expect(denied.status).toBe(409);
      expect((await denied.json() as any).code).toBe('EXAM_ATTEMPT_NOT_CURRENT');
    }
  });
  it('revalida o ciclo e recusa uma tentativa de ciclo substituído', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const started = await call(db, '/api/lms/exams/matriculas/10/tentativas',
      json('POST', undefined, { 'Idempotency-Key': 'idem-cycle-0001' }));
    const a = (await started.json() as any).data;
    db.exec("UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1");
    db.exec("INSERT INTO lms_matricula_ciclos VALUES(2,6,26,10,1,'EM_ANDAMENTO',NULL,NULL)");
    const denied = await call(db, `/api/lms/exams/tentativas/${a.attemptId}/enviar`, json('POST'));
    expect(denied.status).toBe(409);
    expect((await denied.json() as any).code).toBe('EXAM_ATTEMPT_NOT_CURRENT');
  });
  it('não aceita submissão se estudo deixou de estar completo', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const started = await call(db, '/api/lms/exams/matriculas/10/tentativas',
      json('POST', undefined, { 'Idempotency-Key': 'idem-study-0001' }));
    const a = (await started.json() as any).data;
    const partial = JSON.stringify({ 'cmi.core.lesson_location':'1/4',
      'airtrust.total_slides':4,'airtrust.viewed_slides':[1] });
    db.database.prepare('UPDATE lms_progresso_scorm SET cmi_json=? WHERE matricula_id=10').run(partial);
    const denied = await call(db, `/api/lms/exams/tentativas/${a.attemptId}/enviar`, json('POST'));
    expect(denied.status).toBe(409);
    expect((await denied.json() as any).code).toBe('EXAM_ATTEMPT_NOT_CURRENT');
  });
  it('outra pessoa recebe 404 na matrícula alheia', async () => {
    const db = lmsExamDb(); await publishExam(db);
    expect((await call(db, '/api/lms/exams/matriculas/10/prova', {}, { __mockUserId: OTHER_USER })).status).toBe(404);
  });
});

describe('rotas admin — publicar prova e vincular à edição', () => {
  const asAdmin = { __mockRole: 'admin', __mockUserId: 1 };
  it('publica o plano uma vez, vincula à edição e recusa reenvio', async () => {
    const db = lmsExamDb(); const plan = await publishExam(db, false);
    // publishExam already published the plan; a fresh version goes through the route.
    const v2 = { ...plan, version: 2 };
    const pub = await call(db, '/api/lms/exams/admin/cursos/26/provas', json('POST', { plan: v2 }), asAdmin);
    expect(pub.status).toBe(201);
    expect((await call(db, '/api/lms/exams/admin/cursos/26/provas', json('POST', { plan: v2 }), asAdmin)).status).toBe(409);
    expect((await call(db, '/api/lms/exams/admin/cursos/27/provas', json('POST', { plan: v2 }), asAdmin)).status).toBe(422);
    const bindBody = { packageSha256: PKG, statutoryAssessmentRequired: true, approvalNote: 'Aprovado após revisão editorial' };
    expect((await call(db, '/api/lms/exams/admin/cursos/26/provas/exam1/versoes/2/vinculo', json('POST', { ...bindBody, statutoryAssessmentRequired: null }), asAdmin)).status).toBe(422);
    expect((await call(db, '/api/lms/exams/admin/cursos/26/provas/exam1/versoes/2/vinculo', json('POST', bindBody), asAdmin)).status).toBe(201);
    expect((await call(db, '/api/lms/exams/admin/cursos/26/provas/exam1/versoes/2/vinculo', json('POST', bindBody), asAdmin)).status).toBe(409);
  });
  it('aluno não administra provas', async () => {
    const db = lmsExamDb(); const plan = await publishExam(db, false);
    const r = await call(db, '/api/lms/exams/admin/cursos/26/provas', json('POST', { plan: { ...plan, version: 2 } }), { __mockRole: 'student' });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ code: 'RBAC_FORBIDDEN' });
  });
});


describe('catálogo administrativo de edições e questões publicadas', () => {
  const asAdmin = { __mockRole: 'admin', __mockUserId: 1 };
  it('retorna apenas referências verificadas e metadados, nunca gabarito ou explicação', async () => {
    const db = lmsExamDb(); await publishExam(db);
    const response = await call(db, '/api/lms/exams/admin/cursos/26/questoes-publicadas?offset=0', {}, asAdmin);
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.data.items).toHaveLength(10);
    expect(body.data.nextOffset).toBeNull();
    expect(body.data.items[0]).toHaveProperty('contentSha256');
    expect(JSON.stringify(body)).not.toMatch(/correctChoiceId|explanation|SEGREDO|content_json/);
    expect((await call(db, '/api/lms/exams/admin/cursos/26/questoes-publicadas?offset=x', {}, asAdmin)).status).toBe(422);
    expect((await call(db, '/api/lms/exams/admin/cursos/26/questoes-publicadas', {}, { __mockRole: 'student' })).status).toBe(403);
    const other = await call(db, '/api/lms/exams/admin/cursos/26/questoes-publicadas', {}, {
      ...asAdmin, __mockEmpresaId: 7,
    });
    expect((await other.json() as any).data.items).toHaveLength(0);
  });
  it('lista os pacotes registrados do tenant e o vínculo imutável da edição', async () => {
    const db = lmsExamDb(); await publishExam(db);
    db.exec("ALTER TABLE lms_scorm_package_versions ADD COLUMN package_version TEXT");
    db.exec("ALTER TABLE lms_scorm_package_versions ADD COLUMN uploaded_at TEXT");
    db.exec("UPDATE lms_scorm_package_versions SET package_version='1.0',uploaded_at='2026-11-02'");
    const response = await call(db, '/api/lms/exams/admin/cursos/26/edicoes', {}, asAdmin);
    expect(response.status).toBe(200);
    expect((await response.json() as any).data.editions[0]).toMatchObject({
      packageSha256: PKG, packageVersion: '1.0', boundExamId: 'exam1', boundExamVersion: 1,
    });
    const other = await call(db, '/api/lms/exams/admin/cursos/26/edicoes', {}, {
      ...asAdmin, __mockEmpresaId: 7,
    });
    expect((await other.json() as any).data.editions).toHaveLength(0);
  });
});
