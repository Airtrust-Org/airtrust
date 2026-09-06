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
    body: JSON.stringify(body),
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
