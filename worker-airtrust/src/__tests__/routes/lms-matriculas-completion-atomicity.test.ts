/**
 * Contrato de roteamento da conclusão LMS — os quatro call sites (SCORM
 * commit, xAPI statement, POST /:id/finalizar, PATCH /:id/status) delegam
 * toda a persistência da conclusão ao serviço canônico completeLmsMatricula
 * (worker-airtrust/src/services/lms-completion.ts).
 *
 * A prova de atomicidade real (SQL/rollback) está em
 * lms-completion.rollback.test.ts, contra SQLite de verdade. Aqui testamos
 * apenas o CONTRATO da rota: que ela chama o serviço canônico com os
 * parâmetros certos, e que uma LmsCompletionRejectedError vira 409 explícito
 * — nunca 200 com qualification_failed:true, nunca CONCLUIDO silencioso.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  ensureMatriculaCycleMock,
  syncMatriculaCycleFromMatriculaMock,
  completeLmsMatriculaMock,
  logAuditMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  ensureMatriculaCycleMock: vi.fn(),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  completeLmsMatriculaMock: vi.fn(),
  logAuditMock: vi.fn(),
  sendEmailMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
    c.set('userId', 42);
    c.set('userRole', 'admin');
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => next(),
  hasRole: () => true,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-completion', async () => {
  const actual = await vi.importActual<typeof import('../../services/lms-completion')>(
    '../../services/lms-completion',
  );
  return {
    ...actual,
    completeLmsMatricula: completeLmsMatriculaMock,
  };
});

vi.mock('../../services/lms-matricula-cycle', () => ({
  ensureMatriculaCycle: ensureMatriculaCycleMock,
  hasActiveMatriculaCycle: () => false,
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(),
  employeeSectorSql: () => ({ clause: '1 = 1', bindings: [] }),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [] })),
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

vi.mock('../../lib/email', () => ({
  sendEmail: sendEmailMock,
}));

vi.mock('../../services/ensure-certificate', () => ({
  ensureCertificateForQualification: vi.fn(async () => ({ state: 'SKIPPED' })),
}));

import lmsMatriculasRoutes from '../../routes/lms-matriculas';
import { LmsCompletionRejectedError } from '../../services/lms-completion';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
};

function makeTestEnv(handlers: Array<[string, QueryHandler]>) {
  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query.slice(0, 160)}`);

      const handler = entry[1];
      return {
        bind: (...args: unknown[]) => ({
          first: async () => (handler.first ? handler.first(args) : null),
          run: async () => (handler.run ? handler.run(args) : { meta: { changes: 1 } }),
        }),
      };
    }),
  } as unknown as D1Database;

  const app = new Hono<{ Bindings: Env }>();
  app.route('/', lmsMatriculasRoutes);

  return { app, db };
}

const MATRICULA_EM_ANDAMENTO_BASE = {
  id: 1,
  empresa_id: 1,
  funcionario_id: 99,
  status: 'EM_ANDAMENTO',
  progresso_pct: 40,
  tentativas: 1,
  qualificacao_historico_id: null,
  scorm_mastery_score: 70,
  scorm_assessment_policy: 'SCORED',
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_tipo_id: 55,
  curso_titulo: 'Curso com qualificação obrigatória',
  qualificacao_codigo: 'QUAL-X',
  qualificacao_nome: 'Qualificação X',
  qualificacao_categoria: 'TREINAMENTO',
  qualificacao_validade: 12,
};

function makeCommit(body: Record<string, unknown>) {
  return new Request('http://localhost/scorm/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      commit_event: 'SCORM_USER_FINALIZE',
      cmi_json: JSON.stringify({
        'cmi.core.lesson_location': '3/3',
        'airtrust.total_slides': 3,
        'airtrust.viewed_slides': [1, 2, 3],
      }),
      ...body,
    }),
  });
}

function makeFinalizar(id: number) {
  return new Request(`http://localhost/${id}/finalizar`, { method: 'POST' });
}

function makePatchStatus(id: number, body: Record<string, unknown>) {
  return new Request(`http://localhost/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('LMS — contrato de roteamento do serviço canônico de conclusão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMatriculaCycleMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
  });

  it('SCORM commit incomplete cannot poison a Native enrollment with legacy progress', async () => {
    const writes = vi.fn();
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', {
        first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'native' }),
      }],
      ['FROM lms_progresso_scorm', { first: () => null }],
      ['INSERT INTO lms_progresso_scorm', { run: writes }],
      ['UPDATE lms_matriculas', { run: writes }],
    ]);
    const response = await app.fetch(
      makeCommit({ matricula_id: 1, lesson_status: 'incomplete' }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(writes).not.toHaveBeenCalled();
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('SCORM commit: LmsCompletionRejectedError nunca vira 200 — matrícula não é marcada CONCLUIDO', async () => {
    completeLmsMatriculaMock.mockRejectedValue(
      new LmsCompletionRejectedError('Falha ao concluir matrícula: qualificação não pôde ser garantida'),
    );

    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_EM_ANDAMENTO_BASE }],
      ['FROM lms_progresso_scorm', { first: () => null }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const response = await app.fetch(
      makeCommit({
        matricula_id: 1,
        lesson_status: 'passed',
        completion_status: 'completed',
        success_status: 'passed',
        score_raw: 90,
        score_max: 100,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    // Falha obrigatória: erro HTTP sanitizado, NUNCA 200 com qualification_failed:true.
    expect(response.status).toBe(409);
    const json = (await response.json()) as {
      success: boolean;
      code: string;
      data: { novo_status: string; qualificacao_gerada: unknown };
    };
    expect(json.success).toBe(false);
    expect(json.code).toBe('LMS_QUALIFICATION_COMPLETION_FAILED');
    expect(json.data.qualificacao_gerada).toBeNull();
    expect(json.data.novo_status).not.toBe('CONCLUIDO');
    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(
      expect.objectContaining({ matriculaId: 1, gerarQualificacaoAoConcluir: true, qualificacaoTipoId: 55 }),
    );
  });

  it('SCORM commit: category configuration failure keeps enrollment pending and gives actionable code', async () => {
    completeLmsMatriculaMock.mockRejectedValue(new LmsCompletionRejectedError(
      'Internal category validation rejected',
      'LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED',
    ));
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_EM_ANDAMENTO_BASE }],
      ['FROM lms_progresso_scorm', { first: () => null }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);
    const response = await app.fetch(makeCommit({
      matricula_id: 1, lesson_status: 'passed', completion_status: 'completed',
      success_status: 'passed', score_raw: 90, score_max: 100,
    }), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    const body = await response.json() as {
      code: string; error: string;
      data: { novo_status: string; qualification_failure_code: string };
    };
    expect(body.code).toBe('LMS_QUALIFICATION_COMPLETION_FAILED');
    expect(body.data.qualification_failure_code).toBe('LMS_QUALIFICATION_CATEGORY_NOT_INTEGRATED');
    expect(body.error).toMatch(/Gerência de Treinamento/);
    expect(body.data.novo_status).not.toBe('CONCLUIDO');
  });

  it('SCORM commit: outcome qualification_created propaga para a resposta com progresso 100 efetivo', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created',
      qualificacaoHistoricoId: 777,
      matriculaId: 1,
    });

    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_EM_ANDAMENTO_BASE }],
      ['FROM lms_progresso_scorm', { first: () => null }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const response = await app.fetch(
      makeCommit({
        matricula_id: 1,
        lesson_status: 'passed',
        completion_status: 'completed',
        success_status: 'passed',
        score_raw: 90,
        score_max: 100,
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: {
        novo_status: string;
        qualification_failed: boolean;
        progresso_efetivo: number;
        completion_state: string;
        qualificacao_gerada: { qualificacao_historico_id: number };
      };
    };
    expect(json.data.novo_status).toBe('CONCLUIDO');
    expect(json.data.progresso_efetivo).toBe(100);
    expect(json.data.completion_state).toBe('COMPLETED');
    expect(json.data.qualificacao_gerada.qualificacao_historico_id).toBe(777);
  });

  const completeScormCmi = JSON.stringify({
    'cmi.core.lesson_location': '3/3',
    'airtrust.total_slides': 3,
    'airtrust.viewed_slides': [1, 2, 3],
  });
  const finalizingScorm = (overrides: Record<string, unknown> = {}) => ({
    lesson_status: 'passed',
    completion_status: 'completed',
    success_status: 'passed',
    score_raw: 95, score_min: 0, score_max: 100, score_scaled: null,
    cmi_json: completeScormCmi,
    ...overrides,
  });

  it('SCORM finalize: passed/95 without proprietary slide ledger still uses the canonical qualification transaction', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', matriculaId: 1, qualificacaoHistoricoId: 777,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm' }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm({
        cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '3/3' }),
      }) }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
  });

  it('SCORM finalize: full coverage with failed score or nonterminal package stays blocked', async () => {
    for (const row of [
      finalizingScorm({ score_raw: 65 }),
      finalizingScorm({ lesson_status: 'incomplete', completion_status: 'incomplete', success_status: null }),
    ]) {
      completeLmsMatriculaMock.mockClear();
      const { app, db } = makeTestEnv([
        ['FROM lms_matriculas m', { first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm' }) }],
        ['FROM lms_progresso_scorm', { first: () => row }],
      ]);
      const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
      expect(response.status).toBe(409);
      expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
    }
  });

  it('SCORM finalize: score 90 within range 60–100 is 75%, not a passing 90%', async () => {
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE,
        tipo_conteudo: 'scorm', scorm_mastery_score: 80,
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm({
        score_raw: 90, score_min: 60, score_max: 100,
      }) }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    const json = await response.json() as { data: { closure_readiness: { code: string } } };
    expect(json.data.closure_readiness.code).toBe('SCORE_BELOW_MASTERY');
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('SCORM finalize: full server-verified coverage + valid score delegates once to canonical completion', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', matriculaId: 1, qualificacaoHistoricoId: 777,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm' }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm() }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 1, matriculaId: 1, gerarQualificacaoAoConcluir: true,
      qualificacaoTipoId: 55,
    }));
    const json = await response.json() as { data?: { novo_status?: string } };
    expect(json.data?.novo_status).toBe('CONCLUIDO');
  });

  it('SCORM retry: REPROVADO and a prior attempt date do not block canonical completion after passing', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', matriculaId: 1, qualificacaoHistoricoId: 789,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm',
        status: 'REPROVADO', progresso_pct: 99, data_conclusao: '2026-10-12',
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm() }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(expect.objectContaining({
      matriculaId: 1, progressoPct: 100,
      existingHistoricoId: null,
    }));
    const json = await response.json() as { data: { novo_status: string } };
    expect(json.data.novo_status).toBe('CONCLUIDO');
  });

  it('SCORM finalize: formative course requires actual coverage and terminal status but no invented score', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', matriculaId: 1, qualificacaoHistoricoId: 888,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm',
        scorm_assessment_policy: 'FORMATIVE', scorm_mastery_score: null,
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm({
        lesson_status: 'completed', completion_status: 'completed', success_status: null,
        score_raw: null, score_max: null,
      }) }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
  });

  it('POST /:id/finalizar: LmsCompletionRejectedError vira 409 explícito, nunca 200', async () => {
    completeLmsMatriculaMock.mockRejectedValue(new LmsCompletionRejectedError('rejeitado'));

    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'h5p' }) }],
      ['FROM lms_progresso_scorm', { first: () => null }],
    ]);

    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(409);
    const json = (await response.json()) as { success: boolean; code: string; data: { novo_status: string } };
    expect(json.success).toBe(false);
    expect(json.code).toBe('LMS_QUALIFICATION_COMPLETION_FAILED');
    expect(json.data.novo_status).not.toBe('CONCLUIDO');
  });

  it('PATCH status SCORM: ordinary admin path delegates passed/95 to the same canonical transaction', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', matriculaId: 1, qualificacaoHistoricoId: 777,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, curso_id: 10, tipo_conteudo: 'scorm',
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm({
        cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '3/3' }),
      }) }],
      ['SELECT * FROM lms_matriculas WHERE id', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, curso_id: 10, tipo_conteudo: 'scorm',
        status: 'CONCLUIDO', progresso_pct: 100, qualificacao_historico_id: 777,
      }) }],
    ]);
    const response = await app.fetch(
      makePatchStatus(1, { status: 'CONCLUIDO' }),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
  });

  it('PATCH status SCORM: explicit admin override remains separately audited, never treated as learner PASS', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created', qualificacaoHistoricoId: 777, matriculaId: 1,
    });
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, curso_id: 10, tipo_conteudo: 'scorm',
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm({
        score_raw: 30,
        cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '3/3' }),
      }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
      ['SELECT * FROM lms_matriculas WHERE id', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, status: 'CONCLUIDO', progresso_pct: 100,
      }) }],
    ]);
    const response = await app.fetch(
      makePatchStatus(1, {
        status: 'CONCLUIDO',
        observacoes: 'Conciliação formal autorizada após análise documental.',
      }),
      { DB: db } as Env, {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(db, expect.objectContaining({
      action: 'LMS_ADMINISTRATIVE_COMPLETION_OVERRIDE_ACCEPTED',
    }));
  });

  it('SCORM /finalizar: invalid qualification type gives administrative reason instead of generic retry', async () => {
    completeLmsMatriculaMock.mockRejectedValue(new LmsCompletionRejectedError(
      'Internal missing qualification type', 'LMS_QUALIFICATION_MAPPING_INVALID',
    ));
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({
        ...MATRICULA_EM_ANDAMENTO_BASE, tipo_conteudo: 'scorm',
      }) }],
      ['FROM lms_progresso_scorm', { first: () => finalizingScorm() }],
    ]);
    const response = await app.fetch(makeFinalizar(1), { DB: db } as Env, {} as ExecutionContext);
    expect(response.status).toBe(409);
    const body = await response.json() as {
      error: string; data: { qualification_failure_code: string; novo_status: string };
    };
    expect(body.data.qualification_failure_code).toBe('LMS_QUALIFICATION_MAPPING_INVALID');
    expect(body.error).toMatch(/Gerência de Treinamento/);
    expect(body.data.novo_status).not.toBe('CONCLUIDO');
  });

  it('PATCH /:id/status CONCLUIDO: LmsCompletionRejectedError vira 409 explícito, nunca 200', async () => {
    completeLmsMatriculaMock.mockRejectedValue(new LmsCompletionRejectedError('rejeitado'));

    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => ({ ...MATRICULA_EM_ANDAMENTO_BASE, curso_id: 10, tipo_conteudo: 'h5p' }) }],
    ]);

    const response = await app.fetch(
      makePatchStatus(1, { status: 'CONCLUIDO' }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    const json = (await response.json()) as { success: boolean; code: string };
    expect(json.success).toBe(false);
    expect(json.code).toBe('LMS_QUALIFICATION_COMPLETION_FAILED');
  });
});
