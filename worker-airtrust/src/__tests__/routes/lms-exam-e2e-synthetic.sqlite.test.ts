/**
 * E2E de API SINTETICO do modulo de provas LMS (issue #1661).
 * SQLite real em memoria + DDL 0571/0572 + rotas Hono reais. Nenhum dado real,
 * nenhum D1/R2/Cloudflare remoto. Auth: cadeia REAL (JWT HS256 de teste,
 * auth() + tenantMiddleware + requireRole), ativada por env.__realAuth.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  const { tenantMiddleware } = await import('../../middleware/tenant');
  return {
    ...actual,
    // The production app runs auth() then tenantMiddleware() (index.ts); mirror that chain.
    auth: () => {
      const realAuth = actual.auth();
      const realTenant = tenantMiddleware();
      return async (c: any, next: () => Promise<void>) => {
        if (c.env?.__realAuth) {
          return realAuth(c, async () => { await realTenant(c, next); });
        }
        await next();
      };
    },
  };
});

import { Hono } from 'hono';
import learnerRoutes from '../../routes/lms-exam-learner';
import adminRoutes from '../../routes/lms-exam-question-bank-admin';
import { generateJWT } from '../../utils/security';
import { evaluateScormClosureReadiness } from '../../services/lms-matricula-runtime-domain';
import { loadScormManifestClosureEvidence } from '../../services/lms-scorm-completion-context';
import { findApprovedExamEvidence } from '../../services/lms-exams/exam-attempt-store';
import {
  ADMIN_USER, LEARNER_USER, OTHER_USER, PKG, PREFIX, SYNTHETIC_JWT_SECRET, TENANT_B_ADMIN,
  addRealAuthTables, externalBucket, ledger, lmsExamDb, publishExam,
} from '../helpers/exam-lms-fixture';

type Db = ReturnType<typeof lmsExamDb>;
const app = new Hono();
app.onError((e, c) => c.json({ code: (e as { code?: string }).code ?? 'ERROR' },
  ((e as { statusCode?: number }).statusCode ?? 500) as 403));
app.route('/api/lms/exams/admin', adminRoutes);
app.route('/api/lms/exams', learnerRoutes);

const base = '/api/lms/exams';
const jsonInit = (method: string, body?: unknown, headers: Record<string, string> = {}) => ({
  method, headers: { 'content-type': 'application/json', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const mint = (sub: number, empresa: number, role: string) => generateJWT({
  sub: String(sub), empresa_id: empresa, role, email: `u${sub}@sintetico.test`, token_type: 'access',
} as never, SYNTHETIC_JWT_SECRET);

function call(db: Db, path: string, init: RequestInit = {}) {
  const env = {
    DB: db.asD1(), BUCKET: externalBucket(), ENVIRONMENT: 'staging', JWT_SECRET: SYNTHETIC_JWT_SECRET,
    LMS_EXAM_LEARNER_STAGING: 'REVIEWED_SCHEMA_ONLY', LMS_EXAM_QUESTION_ADMIN_STAGING: 'REVIEWED_SCHEMA_ONLY',
    __realAuth: true,
  };
  return app.fetch(new Request('https://t.local' + path, init), env as never);
}
async function as(db: Db, sub: number, empresa: number, role: string, path: string, init: RequestInit = {}) {
  const { token } = await mint(sub, empresa, role);
  const headers = { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` };
  return call(db, path, { ...init, headers });
}
const learner = (db: Db, path: string, init: RequestInit = {}, user = LEARNER_USER) => as(db, user, 6, 'ALUNO', path, init);
const admin = (db: Db, path: string, init: RequestInit = {}) => as(db, ADMIN_USER, 6, 'ADMIN', path, init);

const start = async (db: Db, key: string) => {
  const r = await learner(db, `${base}/matriculas/10/tentativas`, jsonInit('POST', undefined, { 'Idempotency-Key': key }));
  return { status: r.status, body: await r.json() as any };
};
const answer = (db: Db, id: string, q: string, c: string) =>
  learner(db, `${base}/tentativas/${id}/respostas`, jsonInit('PUT', { questionId: q, choiceId: c }));
const submit = (db: Db, id: string) => learner(db, `${base}/tentativas/${id}/enviar`, jsonInit('POST'));
const state = async (db: Db) => (await (await learner(db, `${base}/matriculas/10/prova`)).json() as any).data;
/** q1..q(correct) answer o1 (right), the rest o2 (wrong): score = correct/10. */
async function answerWith(db: Db, id: string, correct: number) {
  for (let i = 1; i <= 10; i++) expect((await answer(db, id, 'q' + i, i <= correct ? 'o1' : 'o2')).status).toBe(200);
}
function freshDb(viewed?: number[]) {
  const db = lmsExamDb({ viewed });
  addRealAuthTables(db);
  // Columns the admin "edicoes" listing reads; the base fixture omits them.
  db.exec('ALTER TABLE lms_scorm_package_versions ADD COLUMN package_version TEXT');
  db.exec('ALTER TABLE lms_scorm_package_versions ADD COLUMN uploaded_at TEXT');
  db.exec("UPDATE lms_scorm_package_versions SET package_version='1.0-sintetico',uploaded_at='2026-11-02'");
  return db;
}
const count = (db: Db, sql: string) => (db.database.prepare(sql).get() as { n: number }).n;
const LEAK = /correctChoiceId|explanation|SEGREDO|content_json/;

describe('E2E sintetico - publicacao, vinculo a edicao e estudo', () => {
  it('conteudo versionado + 10 questoes + plano publicado e vinculado a edicao pela API admin (JWT real)', async () => {
    const db = freshDb(); await publishExam(db, false);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_edition_bindings')).toBe(0);
    expect((await state(db)).state).toBe('NOT_AVAILABLE'); // sem vinculo a prova nao existe
    const bindBody = { packageSha256: PKG, statutoryAssessmentRequired: true, approvalNote: 'Aprovado apos revisao editorial' };
    const url = `${base}/admin/cursos/26/provas/exam1/versoes/1/vinculo`;
    expect((await admin(db, url, jsonInit('POST', bindBody))).status).toBe(201);
    expect((await admin(db, url, jsonInit('POST', bindBody))).status).toBe(409); // imutavel
    const editions = await (await admin(db, `${base}/admin/cursos/26/edicoes`)).json() as any;
    expect(editions.data.editions).toHaveLength(1);
    expect(editions.data.editions[0]).toMatchObject({ packageSha256: PKG, boundExamId: 'exam1', boundExamVersion: 1 });
    expect((await state(db)).state).toBe('READY');
    const bank = await (await admin(db, `${base}/admin/cursos/26/questoes-publicadas`)).json() as any;
    expect(bank.data.items).toHaveLength(10);
    expect(JSON.stringify(bank)).not.toMatch(LEAK);
  });

  it('substituicao por edicao EXTERNAL em curso SCORED: sem nota SCORM, estudo completo libera prova', async () => {
    const db = freshDb([1, 2]);
    // The administrator's edition replacement keeps the course-level SCORED
    // policy; the active EXTERNAL package never sends a SCO score.
    db.exec("UPDATE lms_cursos SET scorm_assessment_policy='SCORED', scorm_mastery_score=80 WHERE id=26 AND empresa_id=6");
    await publishExam(db);
    const before = await state(db);
    expect(before.state).toBe('STUDY_PENDING');
    expect(before.missing).toContain('manifest_required_units');
    expect((await start(db, 'idem-scored-pre-0')).status).toBe(409);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(0);

    // A trusted ledger of the four required slides, with lesson_status
    // completed, is the ONLY change; score_raw remains null.
    db.database.prepare('UPDATE lms_progresso_scorm SET cmi_json=? WHERE matricula_id=10')
      .run(ledger([1, 2, 3, 4]));
    expect(db.database.prepare('SELECT score_raw FROM lms_progresso_scorm WHERE matricula_id=10')
      .get()).toMatchObject({ score_raw: null });
    expect((await state(db)).state).toBe('READY');
    const attempt = await start(db, 'idem-scored-study-complete');
    expect(attempt.status).toBe(201);
    await answerWith(db, attempt.body.data.attemptId, 10);
    expect((await submit(db, attempt.body.data.attemptId)).status).toBe(200);
    expect((await state(db)).state).toBe('PASSED');
    expect(db.database.prepare('SELECT score_raw FROM lms_progresso_scorm WHERE matricula_id=10')
      .get()).toMatchObject({ score_raw: null });
  });

  it('estudo incompleto nao libera a prova; estudo completo atestado pelo ledger libera', async () => {
    const db = freshDb([1, 2]); await publishExam(db);
    // lesson_status=completed e progresso 99% na matricula NAO substituem o ledger.
    const s = await state(db);
    expect(s.state).toBe('STUDY_PENDING');
    expect(s.missing).toContain('manifest_required_units');
    const blocked = await start(db, 'idem-study-block-1');
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('EXAM_STUDY_NOT_COMPLETE');
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(0);
    db.database.prepare('UPDATE lms_progresso_scorm SET cmi_json=? WHERE matricula_id=10').run(ledger([1, 2, 3, 4]));
    expect((await state(db)).state).toBe('READY');
    expect((await start(db, 'idem-study-block-2')).status).toBe(201);
  });
});

describe('E2E sintetico - readback de certificado em matricula concluida', () => {
  function completedDb() {
    const db = freshDb();
    db.exec('ALTER TABLE lms_matriculas ADD COLUMN qualificacao_historico_id INTEGER');
    db.exec('CREATE TABLE qualificacoes_historico (id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, certificado_arquivo_id INTEGER, deleted_at TEXT)');
    db.exec("UPDATE lms_matriculas SET status='CONCLUIDO', qualificacao_historico_id=900 WHERE id=10");
    return db;
  }

  it('COMPLETED distingue qualificação válida sem/ com certificado, sem writes no readback', async () => {
    const db = completedDb(); await publishExam(db);
    db.exec('INSERT INTO qualificacoes_historico (id,empresa_id,certificado_arquivo_id) VALUES (900,6,NULL)');
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'MISSING' });
    db.exec('UPDATE qualificacoes_historico SET certificado_arquivo_id=55 WHERE id=900');
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'ISSUED' });
    expect(count(db, 'SELECT COUNT(*) n FROM qualificacoes_historico')).toBe(1);
  });

  it('fail-closed para vínculo inexistente, excluído e de outro tenant', async () => {
    const db = completedDb(); await publishExam(db);
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'NOT_APPLICABLE' });
    db.exec("INSERT INTO qualificacoes_historico (id,empresa_id,certificado_arquivo_id) VALUES (900,7,55)");
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'NOT_APPLICABLE' });
    db.exec('UPDATE qualificacoes_historico SET empresa_id=6, deleted_at=\'2026-11-07\' WHERE id=900');
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'NOT_APPLICABLE' });
    db.exec('UPDATE qualificacoes_historico SET deleted_at=NULL WHERE id=900');
    expect(await state(db)).toMatchObject({ state: 'COMPLETED', certificate: 'ISSUED' });
    expect(count(db, 'SELECT COUNT(*) n FROM qualificacoes_historico')).toBe(1);
  });

  it('JWT de outro tenant ou outro aluno não obtém o estado de certificado', async () => {
    const db = completedDb(); await publishExam(db);
    db.exec('INSERT INTO qualificacoes_historico (id,empresa_id,certificado_arquivo_id) VALUES (900,6,55)');
    expect((await learner(db, `${base}/matriculas/10/prova`, {}, OTHER_USER)).status).toBe(404);
    expect([403,404]).toContain((await as(db, TENANT_B_ADMIN, 7, 'ADMIN', `${base}/matriculas/10/prova`)).status);
    expect((await state(db)).certificate).toBe('ISSUED');
  });
});

describe('E2E sintetico - gabarito, reprova e aprovacao', () => {
  it('nunca vaza gabarito/explicacao ao aluno, inclusive apos enviar', async () => {
    const db = freshDb(); await publishExam(db);
    const bodies: string[] = [];
    const s = await start(db, 'idem-leak-0001'); bodies.push(JSON.stringify(s.body));
    expect(s.status).toBe(201);
    const id = s.body.data.attemptId as string;
    for (let i = 1; i <= 10; i++) bodies.push(await (await answer(db, id, 'q' + i, 'o2')).text());
    bodies.push(await (await submit(db, id)).text());
    bodies.push(JSON.stringify(await state(db)));
    for (const b of bodies) expect(b).not.toMatch(LEAK);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempt_responses')).toBe(10);
  });

  it('reprova 6/10 e depois aprova 7/10, persistindo tentativas e historico', async () => {
    const db = freshDb(); await publishExam(db);
    const a1 = (await start(db, 'idem-retry-0001')).body.data.attemptId as string;
    await answerWith(db, a1, 6);
    const r1 = await (await submit(db, a1)).json() as any;
    expect(r1.data.result).toMatchObject({ passed: false, answered: 10, unanswered: 0 });
    expect(await state(db)).toMatchObject({ state: 'READY', attemptsUsed: 1, hasOpenAttempt: false, finalizeRequired: false });
    expect(await findApprovedExamEvidence(db.asD1(), { empresaId: 6, matriculaId: 10, activePackagePrefix: PREFIX })).toBeNull();

    const a2r = await start(db, 'idem-retry-0002');
    expect(a2r.status).toBe(201);
    const a2 = a2r.body.data.attemptId as string;
    expect(a2).not.toBe(a1);
    await answerWith(db, a2, 7);
    expect(((await (await submit(db, a2)).json()) as any).data.result.passed).toBe(true);
    expect(await state(db)).toMatchObject({ state: 'PASSED', attemptsUsed: 2, finalizeRequired: true });

    const rows = db.database.prepare('SELECT attempt_no,state,passed FROM lms_exam_attempts ORDER BY attempt_no').all() as any[];
    expect(rows.map(r => [r.attempt_no, r.state, r.passed])).toEqual([[1, 'SUBMITTED', 0], [2, 'SUBMITTED', 1]]);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempt_responses')).toBe(20);
    const replay1 = await (await submit(db, a1)).json() as any; // historico da reprovada intacto
    expect(replay1.data.result.passed).toBe(false);
    const again = await start(db, 'idem-retry-0003'); // aprovada: nova tentativa recusada
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EXAM_ALREADY_PASSED');
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(2);
  });
});

describe('E2E sintetico - idempotencia, replay e concorrencia', () => {
  it('Idempotency-Key repetida no iniciar devolve a mesma tentativa; chave nova com tentativa aberta retoma a mesma', async () => {
    const db = freshDb(); await publishExam(db);
    const a = await start(db, 'idem-same-00001');
    const b = await start(db, 'idem-same-00001');
    const c = await start(db, 'idem-other-0002');
    expect(a.status).toBe(201);
    expect(b.body.data.attemptId).toBe(a.body.data.attemptId);
    expect(c.body.data.attemptId).toBe(a.body.data.attemptId);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(1);
  });

  it('replay do envio devolve o mesmo veredito sem alterar a tentativa selada', async () => {
    const db = freshDb(); await publishExam(db);
    const id = (await start(db, 'idem-replay-001')).body.data.attemptId as string;
    await answerWith(db, id, 8);
    const first = await (await submit(db, id)).json() as any;
    const snap = () => db.database.prepare('SELECT submitted_at,result_json FROM lms_exam_attempts WHERE id=?').get(id);
    const before = { ...(snap() as object) };
    const second = await (await submit(db, id)).json() as any;
    expect(second.data.result).toEqual(first.data.result);
    expect({ ...(snap() as object) }).toEqual(before);
    expect((await answer(db, id, 'q1', 'o2')).status).toBe(409);
  });

  it('Promise.all no iniciar (chaves distintas e mesma chave) resulta em UMA tentativa', async () => {
    const db = freshDb(); await publishExam(db);
    const distinct = await Promise.all(Array.from({ length: 6 }, (_, i) => start(db, `idem-race-dist-${i}`)));
    expect(distinct.every(r => r.status === 201)).toBe(true);
    expect(new Set(distinct.map(r => r.body.data?.attemptId)).size).toBe(1);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(1);

    const db2 = freshDb(); await publishExam(db2);
    const same = await Promise.all(Array.from({ length: 6 }, () => start(db2, 'idem-race-same-0')));
    expect(new Set(same.map(r => r.body.data?.attemptId)).size).toBe(1);
    expect(count(db2, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(1);
  });

  it('Promise.all no enviar resulta em UMA aprovacao selada e veredito unico', async () => {
    const db = freshDb(); await publishExam(db);
    const id = (await start(db, 'idem-race-send-0')).body.data.attemptId as string;
    await answerWith(db, id, 9);
    const sent = await Promise.all(Array.from({ length: 6 }, () => submit(db, id)));
    expect(sent.map(r => r.status)).toEqual(Array(6).fill(200));
    const verdicts = await Promise.all(sent.map(async r => ((await r.json()) as any).data.result.passed));
    expect(new Set(verdicts)).toEqual(new Set([true]));
    expect(count(db, "SELECT COUNT(*) n FROM lms_exam_attempts WHERE state='SUBMITTED' AND passed=1")).toBe(1);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(1);
  });
});

describe('E2E sintetico - negativos de autenticacao, RBAC e tenant (cadeia real)', () => {
  it('sem token => 401 (aluno e admin); token invalido/revogado => 401', async () => {
    const db = freshDb(); await publishExam(db);
    expect((await call(db, `${base}/matriculas/10/prova`)).status).toBe(401);
    expect((await call(db, `${base}/admin/cursos/26/edicoes`)).status).toBe(401);
    expect((await call(db, `${base}/matriculas/10/prova`, { headers: { Authorization: 'Bearer nao.e.um.jwt' } })).status).toBe(401);
    const { token, jti } = await mint(LEARNER_USER, 6, 'ALUNO');
    const hdr = { headers: { Authorization: `Bearer ${token}` } };
    expect((await call(db, `${base}/matriculas/10/prova`, hdr)).status).toBe(200);
    db.database.prepare("INSERT INTO token_blocklist VALUES(?, datetime('now','+1 hour'))").run(jti);
    expect((await call(db, `${base}/matriculas/10/prova`, hdr)).status).toBe(401);
  });

  it('role aluno em rota admin => 403 RBAC (JWT real); admin do mesmo tenant => 200', async () => {
    const db = freshDb(); await publishExam(db);
    for (const [method, path, body] of [
      ['GET', `${base}/admin/cursos/26/edicoes`, undefined],
      ['GET', `${base}/admin/cursos/26/questoes-publicadas`, undefined],
      ['POST', `${base}/admin/cursos/26/provas`, { plan: {} }],
    ] as const) {
      const r = await learner(db, path, jsonInit(method, body));
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ code: 'RBAC_FORBIDDEN' });
    }
    expect((await admin(db, `${base}/admin/cursos/26/edicoes`)).status).toBe(200);
  });

  it('tenant B nao alcanca recursos do tenant A', async () => {
    const db = freshDb(); await publishExam(db);
    const asB = (path: string, init: RequestInit = {}) => as(db, TENANT_B_ADMIN, 7, 'ADMIN', path, init);
    expect(((await (await asB(`${base}/admin/cursos/26/edicoes`)).json()) as any).data.editions).toHaveLength(0);
    expect(((await (await asB(`${base}/admin/cursos/26/questoes-publicadas`)).json()) as any).data.items).toHaveLength(0);
    const plan = { schema: 'x', tenantId: 6, courseId: 26, examId: 'exam1', version: 9 };
    expect([403, 404, 409, 422]).toContain((await asB(`${base}/admin/cursos/26/provas`, jsonInit('POST', { plan }))).status);
    const bindB = await asB(`${base}/admin/cursos/26/provas/exam1/versoes/1/vinculo`,
      jsonInit('POST', { packageSha256: PKG, statutoryAssessmentRequired: true, approvalNote: 'Tentativa cross-tenant sintetica' }));
    expect([403, 404, 422]).toContain(bindB.status);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_edition_bindings WHERE empresa_id=7')).toBe(0);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_plans WHERE empresa_id=7')).toBe(0);
    // Usuario do tenant B tentando a matricula 10 (tenant A) pela rota do aluno.
    expect([403, 404]).toContain((await asB(`${base}/matriculas/10/prova`)).status);
    // Aluna do tenant A com JWT apontando para o tenant B (sem vinculo) cai na autenticacao.
    expect((await as(db, LEARNER_USER, 7, 'ALUNO', `${base}/matriculas/10/prova`)).status).toBe(401);
    // Outra aluna do mesmo tenant nao acessa a matricula alheia.
    expect((await learner(db, `${base}/matriculas/10/prova`, {}, OTHER_USER)).status).toBe(404);
  });

  it('outra aluna nao responde nem envia a tentativa alheia', async () => {
    const db = freshDb(); await publishExam(db);
    const id = (await start(db, 'idem-owner-0001')).body.data.attemptId as string;
    const put = await learner(db, `${base}/tentativas/${id}/respostas`, jsonInit('PUT', { questionId: 'q1', choiceId: 'o1' }), OTHER_USER);
    expect([403, 404]).toContain(put.status);
    expect([403, 404]).toContain((await learner(db, `${base}/tentativas/${id}/enviar`, jsonInit('POST'), OTHER_USER)).status);
    expect(count(db, "SELECT COUNT(*) n FROM lms_exam_attempts WHERE state='IN_PROGRESS'")).toBe(1);
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempt_responses')).toBe(0);
  });
});

describe('E2E sintetico - aprovacao como evidencia de conclusao e reabertura', () => {
  const full = ledger([1, 2, 3, 4]);
  const finalizeCommit = { lesson_status: 'completed', completion_status: 'completed', commit_event: 'SCORM_USER_FINALIZE' } as const;
  const evidence = (db: Db) => loadScormManifestClosureEvidence({
    bucket: externalBucket(), empresaId: 6, cursoId: 26, matriculaId: 10, activePrefix: PREFIX,
    contentType: 'scorm', cmiJson: full, db: db.asD1(),
  });
  const readiness = async (db: Db) => evaluateScormClosureReadiness({
    mode: 'commit', commit: finalizeCommit, wasCompleted: false, cmiJson: full, location: { current: 4, total: 4 },
    policy: 'FORMATIVE', masteryScore: null, scorePct: null, manifest: await evidence(db),
  });

  it('prova aprovada e a evidencia EXTERNAL que destrava o fechamento; reprovada ou ausente, pendente', async () => {
    const db = freshDb(); await publishExam(db);
    expect(await readiness(db)).toMatchObject({ eligible_for_server_verification: false, code: 'EXTERNAL_ASSESSMENT_PENDING' });
    const id = (await start(db, 'idem-evid-00001')).body.data.attemptId as string;
    await answerWith(db, id, 5); await submit(db, id);
    expect((await readiness(db)).code).toBe('EXTERNAL_ASSESSMENT_PENDING');
    const id2 = (await start(db, 'idem-evid-00002')).body.data.attemptId as string;
    await answerWith(db, id2, 10); await submit(db, id2);
    expect(await readiness(db)).toMatchObject({ eligible_for_server_verification: true, code: 'SCORM_READY_FOR_SERVER_VERIFICATION' });
    expect((await evidence(db))?.externalExam?.attemptId).toBe(id2);
  });

  it('reabertura (novo ciclo, simulada em SQL) preserva tentativas antigas mas exige nova prova', async () => {
    const db = freshDb(); await publishExam(db);
    const id = (await start(db, 'idem-reopen-001')).body.data.attemptId as string;
    await answerWith(db, id, 10); await submit(db, id);
    expect((await state(db)).state).toBe('PASSED');
    db.exec('UPDATE lms_matricula_ciclos SET ciclo_atual=0 WHERE id=1');
    db.exec("INSERT INTO lms_matricula_ciclos VALUES(2,6,26,10,1,'EM_ANDAMENTO',NULL,NULL)");
    expect(await state(db)).toMatchObject({ state: 'READY', attemptsUsed: 0, finalizeRequired: false });
    expect((await readiness(db)).code).toBe('EXTERNAL_ASSESSMENT_PENDING');
    expect(db.database.prepare('SELECT ciclo_id,state,passed FROM lms_exam_attempts WHERE id=?').get(id))
      .toMatchObject({ ciclo_id: 1, state: 'SUBMITTED', passed: 1 });
    const fresh = await start(db, 'idem-reopen-002');
    expect(fresh.status).toBe(201);
    expect(fresh.body.data.attemptId).not.toBe(id);
    expect(db.database.prepare('SELECT attempt_no FROM lms_exam_attempts WHERE id=?').get(fresh.body.data.attemptId))
      .toMatchObject({ attempt_no: 1 });
    expect(count(db, 'SELECT COUNT(*) n FROM lms_exam_attempts')).toBe(2);
  });
});
