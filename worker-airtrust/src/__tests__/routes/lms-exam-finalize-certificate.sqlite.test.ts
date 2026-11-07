/**
 * E2E de API SINTETICO: estudo concluido -> prova aprovada -> POST /matriculas/:id/finalizar
 * -> matricula CONCLUIDO -> qualificacao -> certificado (complementa lms-exam-e2e-synthetic, #2023).
 *
 * SQLite real (node:sqlite) + rotas Hono REAIS (lms-matriculas, lms-exam-learner) + servicos reais
 * (completeLmsMatricula, ensureCertificateForQualification, generateCertificateForHistorico,
 * resetMatriculaForNewCycle). Auth: cadeia real (JWT HS256 de teste, auth()+tenant+RBAC).
 * Unicas fronteiras simuladas: R2 (Map em memoria com o contrato get/put/delete) e o HTTP do
 * Cloudflare Browser Rendering (fetch global interceptado; qualquer outra URL falha o teste).
 * Nenhum D1/R2/Cloudflare remoto, nenhum dado real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../middleware/auth')>();
  const { tenantMiddleware } = await import('../../middleware/tenant');
  return {
    ...actual,
    // Producao roda auth() e depois tenantMiddleware() (index.ts); espelhamos a cadeia.
    auth: () => {
      const realAuth = actual.auth();
      const realTenant = tenantMiddleware();
      return async (c: any, next: () => Promise<void>) => {
        if (c.env?.__realAuth) return realAuth(c, async () => { await realTenant(c, next); });
        await next();
      };
    },
  };
});

import { Hono } from 'hono';
import matriculasRoutes from '../../routes/lms-matriculas';
import examLearnerRoutes from '../../routes/lms-exam-learner';
import { generateJWT } from '../../utils/security';
import { ensureCertificateForQualification } from '../../services/ensure-certificate';
import { resetMatriculaForNewCycle } from '../../services/lms-matricula-cycle';
import {
  ADMIN_USER, LEARNER_USER, OTHER_USER, PREFIX, SYNTHETIC_JWT_SECRET, TENANT_B_ADMIN, ledger, publishExam,
} from '../helpers/exam-lms-fixture';
import type { ExamSqliteD1 } from '../helpers/exam-sqlite-d1';
import {
  EMPRESA, FUNC_ALUNO, MATRICULA, TIPO_CODIGO, addAuthTables, finalizeCertificateDb, memoryBucket,
  type AtomicSqliteD1,
} from '../helpers/lms-finalize-certificate-fixture';

const app = new Hono();
app.onError((e, c) => c.json({ code: (e as { code?: string }).code ?? 'ERROR', message: e.message },
  ((e as { statusCode?: number }).statusCode ?? 500) as 403));
app.route('/api/lms/matriculas', matriculasRoutes);
app.route('/api/lms/exams', examLearnerRoutes);

const FINALIZAR = `/api/lms/matriculas/${MATRICULA}/finalizar`;
const exams = '/api/lms/exams';
const CF_PDF = 'https://api.cloudflare.com/client/v4/accounts/synthetic-account/browser-rendering/pdf';

interface Ctx { db: AtomicSqliteD1; r2: ReturnType<typeof memoryBucket>; renders: { n: number; failWith: number | null } }

function setup(opts: { viewed?: number[]; template?: boolean } = {}): Ctx {
  const db = finalizeCertificateDb(opts);
  addAuthTables(db);
  return { db, r2: memoryBucket(), renders: { n: 0, failWith: null } };
}
async function examReady(ctx: Ctx) { await publishExam(ctx.db as unknown as ExamSqliteD1); return ctx; }

const mint = (sub: number, empresa: number, role: string) => generateJWT({
  sub: String(sub), empresa_id: empresa, role, email: `u${sub}@sintetico.test`, token_type: 'access',
} as never, SYNTHETIC_JWT_SECRET);
const jsonInit = (method: string, body?: unknown, headers: Record<string, string> = {}) => ({
  method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
});

function raw(ctx: Ctx, path: string, init: RequestInit = {}) {
  const env = {
    DB: ctx.db.asD1(), BUCKET: ctx.r2.bucket, ENVIRONMENT: 'staging', JWT_SECRET: SYNTHETIC_JWT_SECRET,
    LMS_EXAM_LEARNER_STAGING: 'REVIEWED_SCHEMA_ONLY', CF_ACCOUNT_ID: 'synthetic-account', CF_BROWSER_API_TOKEN: 'synthetic-test-value',
    API_URL: 'https://api.sintetico.test', FRONTEND_URL: 'https://app.sintetico.test', __realAuth: true,
  };
  return app.fetch(new Request('https://t.local' + path, init), env as never);
}
async function as(ctx: Ctx, sub: number, empresa: number, role: string, path: string, init: RequestInit = {}) {
  const { token } = await mint(sub, empresa, role);
  return raw(ctx, path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
}
const learner = (ctx: Ctx, path: string, init: RequestInit = {}, user = LEARNER_USER) => as(ctx, user, EMPRESA, 'ALUNO', path, init);
const finalizar = async (ctx: Ctx, user = LEARNER_USER) => {
  const r = await learner(ctx, FINALIZAR, jsonInit('POST'), user);
  return { status: r.status, body: await r.json() as any };
};

let keySeq = 0;
async function attempt(ctx: Ctx, correct: number) {
  const s = await learner(ctx, `${exams}/matriculas/${MATRICULA}/tentativas`, jsonInit('POST', undefined, { 'Idempotency-Key': `idem-fin-${++keySeq}-0000` }));
  expect(s.status).toBe(201);
  const id = ((await s.json()) as any).data.attemptId as string;
  for (let i = 1; i <= 10; i++) {
    const r = await learner(ctx, `${exams}/tentativas/${id}/respostas`, jsonInit('PUT', { questionId: 'q' + i, choiceId: i <= correct ? 'o1' : 'o2' }));
    expect(r.status).toBe(200);
  }
  const sent = await learner(ctx, `${exams}/tentativas/${id}/enviar`, jsonInit('POST'));
  expect(sent.status).toBe(200);
  return { id, passed: ((await sent.json()) as any).data.result.passed as boolean };
}

const rows = <T = Record<string, any>>(ctx: Ctx, sql: string, ...a: unknown[]) => ctx.db.database.prepare(sql).all(...(a as never[])) as T[];
const one = <T = Record<string, any>>(ctx: Ctx, sql: string, ...a: unknown[]) => ctx.db.database.prepare(sql).get(...(a as never[])) as T;
const n = (ctx: Ctx, sql: string) => (one<{ n: number }>(ctx, sql)).n;
const matricula = (ctx: Ctx) => one(ctx, `SELECT * FROM lms_matriculas WHERE id=${MATRICULA}`);
const auditActions = (ctx: Ctx) => rows<{ action: string }>(ctx, 'SELECT action FROM audit_logs WHERE entity_id=? ORDER BY id', MATRICULA).map((r) => r.action);
/** Counters that must stay at zero whenever nothing legitimate was finalized. */
const artifacts = (ctx: Ctx) => ({
  hist: n(ctx, 'SELECT COUNT(*) n FROM qualificacoes_historico'),
  docs: n(ctx, 'SELECT COUNT(*) n FROM documentos'),
  pasta: n(ctx, 'SELECT COUNT(*) n FROM pasta_virtual'),
  r2: ctx.r2.objects.size,
  renders: ctx.renders.n,
});
const NONE = { hist: 0, docs: 0, pasta: 0, r2: 0, renders: 0 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-07T15:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** Intercepts ONLY the Browser Rendering endpoint; any other outbound URL fails the test loudly. */
function stubBrowserRendering(ctx: Ctx) {
  vi.stubGlobal('fetch', async (url: unknown) => {
    if (String(url) !== CF_PDF) throw new Error('UNEXPECTED_OUTBOUND_FETCH ' + String(url));
    ctx.renders.n += 1;
    if (ctx.renders.failWith) return new Response('render failed', { status: ctx.renders.failWith });
    return new Response(new TextEncoder().encode('%PDF-1.4\n% pdf sintetico ' + ctx.renders.n + '\n%%EOF'), { status: 200 });
  });
}

describe('finalizar - estudo e prova bloqueiam fechamento indevido', () => {
  it('(1) estudo incompleto nao libera certificado, nem com matricula a 99% e lesson_status=completed', async () => {
    const ctx = await examReady(setup({ viewed: [1, 2] })); stubBrowserRendering(ctx);
    const start = await learner(ctx, `${exams}/matriculas/${MATRICULA}/tentativas`, jsonInit('POST', undefined, { 'Idempotency-Key': 'idem-study-block-1' }));
    expect(start.status).toBe(409);
    const r = await finalizar(ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ success: false, code: 'SCORM_COMPLETION_REJECTED' });
    expect(r.body.data.closure_readiness.missing).toContain('manifest_required_units');
    expect(r.body.data.qualificacao_gerada).toBeNull();
    expect(matricula(ctx)).toMatchObject({ status: 'EM_ANDAMENTO', qualificacao_historico_id: null, data_conclusao: null });
    expect(one(ctx, 'SELECT status FROM lms_matricula_ciclos WHERE matricula_id=10').status).toBe('EM_ANDAMENTO');
    expect(artifacts(ctx)).toEqual(NONE);
    expect(auditActions(ctx)).toEqual(['SCORM_COMPLETION_REJECTED']);
  });

  it('prova aprovada nao substitui o estudo: se o ledger de estudo regride, o fechamento segue bloqueado', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    expect((await attempt(ctx, 10)).passed).toBe(true);
    ctx.db.database.prepare('UPDATE lms_progresso_scorm SET cmi_json=? WHERE matricula_id=10').run(ledger([1]));
    const r = await finalizar(ctx);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SCORM_COMPLETION_REJECTED');
    expect(r.body.data.closure_readiness.missing).toContain('manifest_required_units');
    expect(artifacts(ctx)).toEqual(NONE);
    expect(matricula(ctx).status).toBe('EM_ANDAMENTO');
  });

  it('(2) prova reprovada (6/10) mantem a matricula pendente e nada e emitido', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    expect((await attempt(ctx, 6)).passed).toBe(false);
    const r = await finalizar(ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'SCORM_COMPLETION_REJECTED' });
    expect(r.body.data.closure_readiness).toMatchObject({ code: 'EXTERNAL_ASSESSMENT_PENDING', eligible_for_server_verification: false });
    expect(r.body.data.closure_readiness.missing).toContain('verified_external_assessment');
    expect(matricula(ctx)).toMatchObject({ status: 'EM_ANDAMENTO', qualificacao_historico_id: null });
    expect(artifacts(ctx)).toEqual(NONE);
    // administrador do mesmo tenant tampouco contorna o gate de prova
    const asAdmin = await as(ctx, ADMIN_USER, EMPRESA, 'ADMIN', FINALIZAR, jsonInit('POST'));
    expect(asAdmin.status).toBe(409);
    expect(artifacts(ctx)).toEqual(NONE);
    // sem prova nenhuma tentada, idem (tentativa reprovada apenas persistida)
    expect(n(ctx, "SELECT COUNT(*) n FROM lms_exam_attempts WHERE state='SUBMITTED' AND passed=0")).toBe(1);
  });
});

describe('finalizar - aprovacao legitima gera CONCLUIDO + qualificacao + certificado', () => {
  it('(3)(10) aprovada: finaliza e o readback comprova matricula, ciclo, qualificacao, documento, pasta virtual, R2 e auditoria', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    const passed = await attempt(ctx, 10);
    expect(passed.passed).toBe(true);
    const r = await finalizar(ctx);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ novo_status: 'CONCLUIDO', progresso_pct: 100, completion_state: 'COMPLETED' });
    const histId = r.body.data.qualificacao_gerada.qualificacao_historico_id as number;

    const m = matricula(ctx);
    expect(m).toMatchObject({ status: 'CONCLUIDO', qualificacao_historico_id: histId, data_conclusao: '2026-11-07' });
    expect(m.progresso_pct).toBe(100);
    const cycle = one(ctx, 'SELECT * FROM lms_matricula_ciclos WHERE matricula_id=10');
    expect(cycle).toMatchObject({ status: 'CONCLUIDO', ciclo_atual: 1, qualificacao_historico_id: histId, data_conclusao: '2026-11-07' });

    const hist = rows(ctx, 'SELECT * FROM qualificacoes_historico');
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({
      id: histId, funcionario_id: FUNC_ALUNO, empresa_id: EMPRESA, qualificacao_codigo: TIPO_CODIGO, status: 'CONCLUIDA',
      origem_tipo: 'LMS', lms_matricula_id: MATRICULA, lms_matricula_ciclo_id: cycle.id, categoria_codigo: 'EAD',
      data_conclusao: '2026-11-07', data_vencimento: '2027-11-07', validade_meses: 12, renovacao_de: null,
    });

    // certificado: documento + pasta virtual + objeto R2 + vinculo no historico
    const doc = rows(ctx, 'SELECT * FROM documentos');
    expect(doc).toHaveLength(1);
    expect(doc[0]).toMatchObject({ funcionario_id: FUNC_ALUNO, empresa_id: EMPRESA, tipo: 'application/pdf' });
    expect(doc[0].r2_key).toMatch(new RegExp(`^.*empresa-${EMPRESA}.*historico-${histId}`));
    expect(doc[0].r2_key).not.toMatch(/00000000000|Aluno/); // sem CPF/nome na chave
    expect(hist[0]).toMatchObject({ certificado_arquivo_id: doc[0].id, arquivo_url: `/api/pasta-virtual/stream/${doc[0].id}` });
    expect(hist[0].numero_certificado).toBeTruthy();
    expect(hist[0].validacao_hash).toMatch(/^[0-9A-F]{16}$/); // hash de validacao do QR persistido
    expect(rows(ctx, 'SELECT * FROM pasta_virtual')).toMatchObject([
      { documento_id: doc[0].id, certificacao_id: histId, empresa_id: EMPRESA, tipo_documento: 'CERTIFICADO', caminho_arquivo: doc[0].r2_key },
    ]);
    expect(ctx.r2.objects.size).toBe(1);
    const stored = ctx.r2.objects.get(doc[0].r2_key as string)!;
    expect(new TextDecoder().decode(stored.body.slice(0, 4))).toBe('%PDF');
    expect(stored.contentType).toBe('application/pdf');
    expect(doc[0].tamanho).toBe(stored.body.length);
    expect(ctx.renders.n).toBe(1);

    // prova que originou a evidencia continua selada e ligada ao ciclo corrente
    expect(one(ctx, 'SELECT state,passed,ciclo_id FROM lms_exam_attempts WHERE id=?', passed.id))
      .toMatchObject({ state: 'SUBMITTED', passed: 1, ciclo_id: cycle.id });

    expect(auditActions(ctx)).toEqual(expect.arrayContaining([
      'LMS_MATRICULA_FINALIZADA_MANUAL', 'SCORM_COMPLETION_ACCEPTED', 'SCORM_QUALIFICATION_TRIGGERED',
    ]));
    expect(auditActions(ctx)).not.toContain('SCORM_COMPLETION_REJECTED');
    const done = one<{ n: number }>(ctx, "SELECT COUNT(*) n FROM audit_logs WHERE action='LMS_MATRICULA_FINALIZADA_MANUAL' AND user_id=?", LEARNER_USER);
    expect(done.n).toBe(2); // 1 do servico canonico (batch atomico) + 1 da rota
    expect(n(ctx, "SELECT COUNT(*) n FROM auditoria WHERE tabela_afetada='documentos' AND acao='INSERT'")).toBe(1);
  });

  it('(5) reenvio apos concluir e idempotente: mesmo historico, mesmo documento, sem nova renderizacao', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    await attempt(ctx, 10);
    const first = await finalizar(ctx);
    const snap = () => JSON.stringify({
      m: matricula(ctx), c: rows(ctx, 'SELECT * FROM lms_matricula_ciclos'), h: rows(ctx, 'SELECT * FROM qualificacoes_historico'),
      d: rows(ctx, 'SELECT * FROM documentos'), p: rows(ctx, 'SELECT * FROM pasta_virtual'), r2: [...ctx.r2.objects.keys()],
    });
    const before = snap();
    const auditBefore = n(ctx, 'SELECT COUNT(*) n FROM audit_logs');
    for (let i = 0; i < 3; i++) {
      const again = await finalizar(ctx);
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ novo_status: 'CONCLUIDO', progresso_pct: 100 });
    }
    expect(snap()).toBe(before); // nenhum registro novo nem alterado
    expect(ctx.renders.n).toBe(1);
    expect(n(ctx, 'SELECT COUNT(*) n FROM audit_logs')).toBe(auditBefore);
    expect(first.body.data.qualificacao_gerada.qualificacao_historico_id).toBe(matricula(ctx).qualificacao_historico_id);
  });
});

describe('finalizar - concorrencia', () => {
  it('(4) Promise.all x2 (sem barreira): uma qualificacao, um certificado, um objeto R2', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    await attempt(ctx, 10);
    const res = await Promise.all([finalizar(ctx), finalizar(ctx)]);
    expect(res.map((r) => r.status)).toEqual([200, 200]);
    expect(new Set(res.map((r) => r.body.data.novo_status))).toEqual(new Set(['CONCLUIDO']));
    const art = artifacts(ctx);
    expect(art).toMatchObject({ hist: 1, docs: 1, pasta: 1, r2: 1 });
    const h = one(ctx, 'SELECT id, certificado_arquivo_id FROM qualificacoes_historico');
    expect(h.certificado_arquivo_id).toBe(one(ctx, 'SELECT id FROM documentos').id);
    expect(matricula(ctx)).toMatchObject({ status: 'CONCLUIDO', qualificacao_historico_id: h.id });
    expect(n(ctx, "SELECT COUNT(*) n FROM lms_matricula_ciclos WHERE matricula_id=10")).toBe(1);
  });

  it('(4) corrida forcada: ambas leem o estado vazio e chegam juntas ao batch -> UNIQUE perde, retry reutiliza, 1 qualificacao e 1 certificado', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    await attempt(ctx, 10);
    ctx.db.hooks.barrier = { match: /INSERT INTO qualificacoes_historico/, parties: 2, waiting: [] };
    const res = await Promise.all([finalizar(ctx), finalizar(ctx)]);
    expect(res.map((r) => r.status)).toEqual([200, 200]);
    // a barreira realmente foi exercida e liberada: dois batches de conclusao tentaram inserir
    expect(ctx.db.hooks.barrier).toBeNull();
    const completionBatches = ctx.db.hooks.batchLog.filter((b) => b.some((s) => /INSERT INTO qualificacoes_historico/.test(s)));
    expect(completionBatches.length).toBeGreaterThanOrEqual(2);
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 1, pasta: 1, r2: 1 });
    const hist = one(ctx, 'SELECT * FROM qualificacoes_historico');
    expect(hist.status).toBe('CONCLUIDA');
    expect(matricula(ctx)).toMatchObject({ status: 'CONCLUIDO', qualificacao_historico_id: hist.id });
    expect(hist.certificado_arquivo_id).toBe(one(ctx, 'SELECT id FROM documentos').id);
    expect(n(ctx, "SELECT COUNT(*) n FROM lms_matricula_ciclos WHERE matricula_id=10")).toBe(1);
    // residuo do perdedor da corrida do certificado foi limpo (R2 e D1 coerentes)
    expect(rows(ctx, 'SELECT r2_key FROM documentos').map((d) => d.r2_key)).toEqual([...ctx.r2.objects.keys()]);
  });
});

describe('finalizar - falhas de persistencia nao deixam estado parcialmente certificado', () => {
  async function ready() {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    await attempt(ctx, 10);
    return ctx;
  }

  it('(6a) falha no batch D1 de conclusao: 409, rollback total (sem historico, matricula e ciclo intactos, sem certificado)', async () => {
    const ctx = await ready();
    ctx.db.injectFault(/UPDATE lms_matriculas\s+SET status = 'CONCLUIDO'/);
    const r = await finalizar(ctx);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'LMS_QUALIFICATION_COMPLETION_FAILED', data: { qualificacao_gerada: null } });
    expect(matricula(ctx)).toMatchObject({ status: 'EM_ANDAMENTO', qualificacao_historico_id: null, data_conclusao: null });
    expect(one(ctx, 'SELECT status,qualificacao_historico_id FROM lms_matricula_ciclos WHERE matricula_id=10'))
      .toEqual({ status: 'EM_ANDAMENTO', qualificacao_historico_id: null });
    expect(artifacts(ctx)).toEqual(NONE);
    expect(auditActions(ctx)).toContain('LMS_QUALIFICATION_COMPLETION_FAILED');
    expect(auditActions(ctx)).not.toContain('SCORM_COMPLETION_ACCEPTED');
    // recuperacao: removida a falha, o mesmo pedido conclui normalmente (sem duplicar)
    const retry = await finalizar(ctx);
    expect(retry.status).toBe(200);
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 1, pasta: 1, r2: 1, renders: 1 });
  });

  it('(6b) falha ao gravar documento/pasta virtual no D1 apos o R2: batch inteiro revertido e objeto R2 removido', async () => {
    const ctx = await ready();
    ctx.db.injectFault(/INSERT INTO pasta_virtual/);
    const r = await finalizar(ctx);
    // a conclusao + qualificacao ja haviam sido commitadas atomicamente; o certificado e servico separado
    expect(r.status).toBe(200);
    const h = one(ctx, 'SELECT * FROM qualificacoes_historico');
    expect(h).toMatchObject({ status: 'CONCLUIDA', certificado_arquivo_id: null, arquivo_url: null, numero_certificado: null });
    expect(matricula(ctx).status).toBe('CONCLUIDO');
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 0, pasta: 0, r2: 0 });
    expect(ctx.r2.state.puts).toBe(1);
    expect(ctx.r2.state.deletes).toBe(1); // objeto orfao removido
    // reconciliacao explicita (servico de manutencao) emite exatamente um certificado
    const env = { DB: ctx.db.asD1(), BUCKET: ctx.r2.bucket, CF_ACCOUNT_ID: 'synthetic-account', CF_BROWSER_API_TOKEN: 'synthetic-test-value',
      API_URL: 'https://api.sintetico.test', FRONTEND_URL: 'https://app.sintetico.test' };
    const healed = await ensureCertificateForQualification(env as never, h.id, EMPRESA);
    expect(healed.state).toBe('CREATED');
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 1, pasta: 1, r2: 1 });
    expect((await ensureCertificateForQualification(env as never, h.id, EMPRESA)).state).toBe('EXISTS');
    expect(artifacts(ctx)).toMatchObject({ docs: 1, pasta: 1, r2: 1 });
  });

  it('(6c) falha do R2 (put): nenhum documento/pasta, historico sem certificado', async () => {
    const ctx = await ready();
    ctx.r2.state.putFails = true;
    const r = await finalizar(ctx);
    expect(r.status).toBe(200);
    expect(one(ctx, 'SELECT certificado_arquivo_id c FROM qualificacoes_historico').c).toBeNull();
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 0, pasta: 0, r2: 0 });
    expect(ctx.r2.state.puts).toBe(1);
  });

  it('(6d) falha do renderizador de PDF: nenhum objeto R2 nem registro de certificado', async () => {
    const ctx = await ready();
    ctx.renders.failWith = 400; // 4xx nao e reexecutado
    const r = await finalizar(ctx);
    expect(r.status).toBe(200);
    expect(one(ctx, 'SELECT certificado_arquivo_id c FROM qualificacoes_historico').c).toBeNull();
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 0, pasta: 0, r2: 0, renders: 1 });
    expect(ctx.r2.state.puts).toBe(0);
  });
});

describe('finalizar - novo ciclo', () => {
  async function completeCycleOne() {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    const exam1 = await attempt(ctx, 10);
    const fin = await finalizar(ctx);
    expect(fin.status).toBe(200);
    const snapshot = {
      hist: one(ctx, 'SELECT * FROM qualificacoes_historico WHERE id=?', fin.body.data.qualificacao_gerada.qualificacao_historico_id),
      doc: one(ctx, 'SELECT * FROM documentos'),
      attempt: one(ctx, 'SELECT * FROM lms_exam_attempts WHERE id=?', exam1.id),
      r2Key: [...ctx.r2.objects.keys()][0],
      cycle1: one(ctx, 'SELECT * FROM lms_matricula_ciclos WHERE numero_ciclo=1'),
    };
    return { ctx, exam1, snapshot };
  }

  it('(7)(8) novo ciclo preserva qualificacao, certificado, tentativa e evidencias antigas e exige novo estudo, nova prova e nova finalizacao', async () => {
    const { ctx, exam1, snapshot } = await completeCycleOne();
    const oldCmi = one(ctx, 'SELECT cmi_json FROM lms_progresso_scorm').cmi_json;

    // renovacao do ciclo pelo servico real (terminal -> NAO_INICIADO), meses depois
    vi.setSystemTime(new Date('2027-02-10T15:00:00Z'));
    const newCycleId = await resetMatriculaForNewCycle(ctx.db.asD1(), { empresaId: EMPRESA, matriculaId: MATRICULA, origin: 'AUTO_RENOVACAO', observacoes: 'Renovacao sintetica' });
    expect(newCycleId).not.toBe(snapshot.cycle1.id);

    // (7) evidencias antigas intactas
    expect(one(ctx, 'SELECT * FROM qualificacoes_historico WHERE id=?', snapshot.hist.id)).toMatchObject({
      status: 'CONCLUIDA', certificado_arquivo_id: snapshot.doc.id, numero_certificado: snapshot.hist.numero_certificado,
      lms_matricula_ciclo_id: snapshot.cycle1.id,
    });
    expect(one(ctx, 'SELECT * FROM documentos WHERE id=?', snapshot.doc.id)).toEqual(snapshot.doc);
    expect(ctx.r2.objects.has(snapshot.r2Key)).toBe(true);
    expect(one(ctx, 'SELECT * FROM lms_exam_attempts WHERE id=?', exam1.id)).toEqual(snapshot.attempt);
    const archived = one(ctx, 'SELECT * FROM lms_ciclo_evidencias WHERE ciclo_id=?', snapshot.cycle1.id);
    expect(JSON.parse(archived.enrollment_json)).toMatchObject({ status: 'CONCLUIDO', qualificacao_historico_id: snapshot.hist.id });
    expect(JSON.parse(archived.scorm_json).cmi_json).toBe(oldCmi);
    expect(one(ctx, 'SELECT status,ciclo_atual,qualificacao_historico_id FROM lms_matricula_ciclos WHERE id=?', snapshot.cycle1.id))
      .toEqual({ status: 'CONCLUIDO', ciclo_atual: 0, qualificacao_historico_id: snapshot.hist.id });

    // (8) a conclusao antiga NAO conta no ciclo novo
    expect(matricula(ctx)).toMatchObject({ status: 'NAO_INICIADO', qualificacao_historico_id: null, data_conclusao: null, progresso_pct: 0 });
    const stateRes = await learner(ctx, `${exams}/matriculas/${MATRICULA}/prova`);
    expect(((await stateRes.json()) as any).data).toMatchObject({ attemptsUsed: 0 });
    const blockedStudy = await finalizar(ctx);
    expect(blockedStudy.status).toBe(409);
    expect(blockedStudy.body.code).toBe('SCORM_COMPLETION_REJECTED');
    // estudo refeito, mas sem a prova do novo ciclo (a aprovada e do ciclo anterior): ainda pendente
    ctx.db.database.prepare("UPDATE lms_progresso_scorm SET cmi_json=?, lesson_status='completed', completion_status='completed' WHERE matricula_id=10").run(ledger([1, 2, 3, 4]));
    ctx.db.database.prepare("UPDATE lms_matriculas SET status='EM_ANDAMENTO', progresso_pct=99 WHERE id=10").run();
    ctx.db.database.prepare("UPDATE lms_matricula_ciclos SET status='EM_ANDAMENTO' WHERE id=?").run(newCycleId);
    const pendingExam = await finalizar(ctx);
    expect(pendingExam.status).toBe(409);
    expect(pendingExam.body.data.closure_readiness.missing).toContain('verified_external_assessment');
    expect(n(ctx, 'SELECT COUNT(*) n FROM qualificacoes_historico')).toBe(1);
    expect(n(ctx, 'SELECT COUNT(*) n FROM documentos')).toBe(1);

    // nova prova aprovada no novo ciclo -> nova conclusao legitima
    const exam2 = await attempt(ctx, 9);
    expect(exam2.id).not.toBe(exam1.id);
    expect(one(ctx, 'SELECT ciclo_id, attempt_no FROM lms_exam_attempts WHERE id=?', exam2.id)).toEqual({ ciclo_id: newCycleId, attempt_no: 1 });
    const fin2 = await finalizar(ctx);
    expect(fin2.status).toBe(200);
    const hist = rows(ctx, 'SELECT * FROM qualificacoes_historico ORDER BY id');
    expect(hist).toHaveLength(2);
    expect(hist[0]).toMatchObject({ id: snapshot.hist.id, status: 'RENOVADA', renovada: 1, certificado_arquivo_id: snapshot.doc.id });
    expect(hist[1]).toMatchObject({ status: 'CONCLUIDA', renovacao_de: snapshot.hist.id, data_conclusao: '2027-02-10', lms_matricula_ciclo_id: newCycleId });
    expect(hist[1].certificado_arquivo_id).not.toBe(snapshot.doc.id);
    expect(matricula(ctx)).toMatchObject({ status: 'CONCLUIDO', qualificacao_historico_id: hist[1].id });
    expect(artifacts(ctx)).toMatchObject({ hist: 2, docs: 2, pasta: 2, r2: 2, renders: 2 });
    expect(ctx.r2.objects.has(snapshot.r2Key)).toBe(true); // o PDF antigo segue ali
    expect(n(ctx, 'SELECT COUNT(*) n FROM lms_exam_attempts WHERE passed=1')).toBe(2);
    expect(n(ctx, 'SELECT COUNT(*) n FROM lms_matricula_ciclos')).toBe(2);
  });
});

describe('finalizar - autorizacao e isolamento de tenant', () => {
  it('(9) outro funcionario, usuario sem vinculo, tenant B e anonimo nao finalizam matricula alheia; nada muda', async () => {
    const ctx = await examReady(setup()); stubBrowserRendering(ctx);
    await attempt(ctx, 10); // a matricula esta legitimamente pronta: so a autorizacao pode barrar
    const before = JSON.stringify([matricula(ctx), rows(ctx, 'SELECT * FROM lms_matricula_ciclos')]);

    const other = await finalizar(ctx, OTHER_USER);
    expect(other.status).toBe(403);
    const unlinked = await finalizar(ctx, 502);
    expect(unlinked.status).toBe(403);
    const tenantB = await as(ctx, TENANT_B_ADMIN, 7, 'ADMIN', FINALIZAR, jsonInit('POST'));
    expect(tenantB.status).toBe(404);
    // JWT do aluno apontando para o tenant B (sem vinculo) cai na autenticacao
    expect((await as(ctx, LEARNER_USER, 7, 'ALUNO', FINALIZAR, jsonInit('POST'))).status).toBe(401);
    expect((await raw(ctx, FINALIZAR, jsonInit('POST'))).status).toBe(401);
    expect((await raw(ctx, FINALIZAR, { method: 'POST', headers: { Authorization: 'Bearer nao.e.um.jwt' } })).status).toBe(401);

    expect(JSON.stringify([matricula(ctx), rows(ctx, 'SELECT * FROM lms_matricula_ciclos')])).toBe(before);
    expect(artifacts(ctx)).toEqual(NONE);
    expect(n(ctx, "SELECT COUNT(*) n FROM audit_logs WHERE action LIKE 'LMS_MATRICULA_FINALIZADA%' OR action='SCORM_COMPLETION_ACCEPTED'")).toBe(0);

    // controle: o dono legitimo conclui na sequencia
    expect((await finalizar(ctx)).status).toBe(200);
    expect(artifacts(ctx)).toMatchObject({ hist: 1, docs: 1, pasta: 1, r2: 1 });
    expect(one(ctx, 'SELECT funcionario_id FROM qualificacoes_historico').funcionario_id).toBe(FUNC_ALUNO);
    expect(PREFIX).toContain(`/${EMPRESA}/`);
  });
});
