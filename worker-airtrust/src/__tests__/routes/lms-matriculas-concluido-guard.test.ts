/**
 * Testes para o guard anti-downgrade de CONCLUIDO no SCORM commit.
 *
 * Regra: matrícula CONCLUIDO é somente leitura para commit SCORM.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

type ScormCommitBody = {
  success: boolean;
  data: {
    ignoredReviewCommit?: boolean;
    novo_status?: string;
    progresso_pct?: number;
  };
};

import type { Env } from '../../types';

const {
  ensureMatriculaCycleMock,
  syncMatriculaCycleFromMatriculaMock,
  createLmsQualificationOnCompletionMock,
  logAuditMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  ensureMatriculaCycleMock: vi.fn(),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  createLmsQualificationOnCompletionMock: vi.fn(),
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
  hasRole: () => true,
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-qualification', () => ({
  createLmsQualificationOnCompletion: createLmsQualificationOnCompletionMock,
}));

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

import lmsMatriculasRoutes from '../../routes/lms-matriculas';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
};

function makeTestEnv(handlers: Array<[string, QueryHandler]>) {
  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) throw new Error(`Unhandled query: ${query.slice(0, 120)}`);

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

const MATRICULA_CONCLUIDA = {
  id: 1, empresa_id: 1, funcionario_id: 99,
  status: 'CONCLUIDO', progresso_pct: 100, tentativas: 1,
  qualificacao_historico_id: null,
  scorm_mastery_score: 70, gerar_qualificacao_ao_concluir: 0,
  qualificacao_tipo_id: null, curso_titulo: 'Teste SCORM',
  qualificacao_codigo: null, qualificacao_nome: null,
  qualificacao_categoria: null, qualificacao_validade: null,
};

function makeCommit(body: Record<string, unknown>) {
  return new Request('http://localhost/scorm/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('lms matriculas concluido guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMatriculaCycleMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    createLmsQualificationOnCompletionMock.mockResolvedValue(null);
  });

  // ─── T1: Bloqueia downgrade CONCLUIDO → incomplete ───────────────────────

  it('bloqueia commit SCORM com lesson_status=incomplete em matricula CONCLUIDO', async () => {
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_CONCLUIDA }],
      ['FROM lms_progresso_scorm', { first: () => null }],
    ]);

    const response = await app.fetch(makeCommit({
      matricula_id: 1,
      lesson_status: 'incomplete',
      completion_status: 'incomplete',
      score_raw: 30,
      score_max: 100,
    }), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = await response.json() as ScormCommitBody;
    expect(json.success).toBe(true);
    expect(json.data.ignoredReviewCommit).toBe(true);
    expect(json.data.novo_status).toBe('CONCLUIDO');
    expect(json.data.progresso_pct).toBe(100);
  });

  // ─── T2: Bloqueia downgrade CONCLUIDO → failed ───────────────────────────

  it('bloqueia commit SCORM com lesson_status=failed em matricula CONCLUIDO', async () => {
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_CONCLUIDA }],
      ['FROM lms_progresso_scorm', { first: () => null }],
    ]);

    const response = await app.fetch(makeCommit({
      matricula_id: 1,
      lesson_status: 'failed',
      score_raw: 20,
      score_max: 100,
    }), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = await response.json() as ScormCommitBody;
    expect(json.success).toBe(true);
    expect(json.data.ignoredReviewCommit).toBe(true);
    expect(json.data.novo_status).toBe('CONCLUIDO');
  });

  // ─── T3: Bloqueia downgrade CONCLUIDO → not attempted ────────────────────

  it('bloqueia commit SCORM com completion_status=not attempted em matricula CONCLUIDO', async () => {
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_CONCLUIDA }],
      ['FROM lms_progresso_scorm', { first: () => null }],
    ]);

    const response = await app.fetch(makeCommit({
      matricula_id: 1,
      completion_status: 'not attempted',
    }), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = await response.json() as ScormCommitBody;
    expect(json.success).toBe(true);
    expect(json.data.ignoredReviewCommit).toBe(true);
    expect(json.data.novo_status).toBe('CONCLUIDO');
  });

  // ─── T4: Commit de revisão em CONCLUIDO não escreve estado SCORM ───────

  it('ignora commit SCORM sem lesson_status em matrícula concluída', async () => {
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_CONCLUIDA }],
      ['FROM lms_progresso_scorm', {
        first: () => ({
          lesson_status: 'passed', completion_status: 'completed',
          success_status: 'passed', score_raw: 90, score_max: 100,
          score_min: 0, score_scaled: 0.9,
          session_time: null, total_time: null,
          suspend_data: 'data', launch_data: null, cmi_json: null,
        }),
      }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 0 } }) }],
    ]);

    const response = await app.fetch(makeCommit({
      matricula_id: 1,
      suspend_data: 'updated-bookmark',
      session_time: 'PT30S',
    }), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = await response.json() as ScormCommitBody;
    expect(json.success).toBe(true);
    expect(json.data.ignoredReviewCommit).toBe(true);
  });

  // ─── T5: "Rever" replay (lesson_status=passed) em CONCLUIDO não reescreve
  // data_conclusao, não incrementa tentativas e não gera qualificação/certificado ──

  it('replay de "Rever" (status=passed) em matricula CONCLUIDO preserva data_conclusao e tentativas', async () => {
    const updateBindCalls: unknown[][] = [];
    const { app, db } = makeTestEnv([
      ['FROM lms_matriculas m', { first: () => MATRICULA_CONCLUIDA }],
      ['FROM lms_progresso_scorm', {
        first: () => ({
          lesson_status: 'passed', completion_status: 'completed',
          success_status: 'passed', score_raw: 90, score_max: 100,
          score_min: 0, score_scaled: 0.9,
          session_time: null, total_time: null,
          suspend_data: 'data', launch_data: null, cmi_json: null,
        }),
      }],
      ['INSERT INTO lms_progresso_scorm', { run: () => ({ meta: { changes: 1 } }) }],
      ['UPDATE lms_matriculas', {
        run: (args) => {
          updateBindCalls.push(args);
          return { meta: { changes: 0 } };
        },
      }],
    ]);

    const response = await app.fetch(makeCommit({
      matricula_id: 1,
      lesson_status: 'passed',
      completion_status: 'completed',
      score_raw: 95,
      score_max: 100,
    }), { DB: db } as Env, {} as ExecutionContext);

    expect(response.status).toBe(200);
    const json = await response.json() as ScormCommitBody;
    expect(json.success).toBe(true);
    expect(json.data.ignoredReviewCommit).toBe(true);

    expect(updateBindCalls).toHaveLength(0);
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });
});
