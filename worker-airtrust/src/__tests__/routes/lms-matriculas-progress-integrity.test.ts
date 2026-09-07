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
  auth:
    () => async (c: { set: (key: string, value: unknown) => void }, next: () => Promise<void>) => {
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
  hasActiveMatriculaCycle: (
    record: { status?: string | null; deleted_at?: string | null } | null,
  ) =>
    Boolean(
      record &&
      !record.deleted_at &&
      ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(record.status)),
    ),
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
import { enforceLmsCompletionIntegrity } from '../../middleware/lms-completion-integrity';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const handler = entry[1];
      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };
      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      return {
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        all: async () => executeAll([]),
        bind: (...args: unknown[]) => ({
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
          all: async () => executeAll(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('lms matriculas progress integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureMatriculaCycleMock.mockResolvedValue(undefined);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: 0,
    });
    logAuditMock.mockResolvedValue(undefined);
    sendEmailMock.mockResolvedValue(true);
  });

  it('preserva matrícula existente em vez de resetar o progresso no rematricular manual', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, titulo FROM lms_cursos',
        {
          first: () => ({ id: 9, titulo: 'AW139' }),
        },
      ],
      [
        'FROM funcionarios',
        {
          first: () => ({ id: 77, nome: 'Aluno AW139' }),
        },
      ],
      [
        'FROM lms_matriculas\n        WHERE curso_id = ?',
        {
          first: () => ({ id: 501, status: 'CONCLUIDO', deleted_at: null }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 77,
          curso_id: 9,
          observacoes: 'reativar',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 501,
        curso_id: 9,
        funcionario_id: 77,
        status: 'CONCLUIDO',
        preserved_existing_enrollment: true,
        explicit_reset_required: true,
      },
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO lms_matriculas'))).toBe(false);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'LMS_MATRICULA_PRESERVADA',
        entityId: 501,
      }),
    );
  });

  it('ignora matrícula em lote quando já existe matrícula preservável em vez de resetar progresso', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, titulo, qualificacao_tipo_id FROM lms_cursos',
        {
          first: () => ({ id: 9, titulo: 'AW139', qualificacao_tipo_id: null }),
        },
      ],
      [
        'SELECT id, nome, setor_id FROM funcionarios',
        {
          all: () => ({ results: [{ id: 77, nome: 'Aluno AW139' }] }),
        },
      ],
      [
        'FROM lms_matriculas\n        WHERE curso_id = ?',
        {
          first: () => ({ id: 501, status: 'CONCLUIDO', deleted_at: null }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          funcionario_ids: [77],
          curso_id: 9,
          observacoes: 'reativar em lote',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        criadas: 0,
        ignoradas: 1,
        erros: 0,
      },
    });
    expect(calls.some((call) => call.query.includes('INSERT INTO lms_matriculas'))).toBe(false);
  });

  it('ignora commit SCORM stale e preserva cmi_json/suspend_data mais avançados', async () => {
    const currentCmi = JSON.stringify({
      'cmi.location': '103/120',
      'cmi.suspend_data': 'latest-answer-set',
    });
    const staleCmi = JSON.stringify({
      'cmi.location': '12/120',
      'cmi.suspend_data': 'older-answer-set',
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 501,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 80,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'AW139',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 80,
            score_max: 100,
            score_min: 0,
            score_scaled: 0.8,
            session_time: '0000:05:00.00',
            total_time: '0001:00:00.00',
            suspend_data: 'latest-answer-set',
            launch_data: null,
            cmi_json: currentCmi,
          }),
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 501,
          lesson_status: 'incomplete',
          score_raw: 12,
          score_max: 100,
          suspend_data: 'older-answer-set',
          cmi_json: staleCmi,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 501,
        novo_status: 'EM_ANDAMENTO',
        progresso_pct: 86,
        completion_diagnostic: {
          progresso_pct: 86,
          location: '103/120',
        },
      },
    });
    const scormUpsert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO lms_progresso_scorm'),
    );
    expect(scormUpsert?.args[11]).toBe('latest-answer-set');
    const mergedStaleCmi = JSON.parse(String(scormUpsert?.args[13]));
    expect(mergedStaleCmi['cmi.location']).toBe('103/120');
    expect(mergedStaleCmi['cmi.core.lesson_location']).toBe('103/120');
    expect(mergedStaleCmi['cmi.suspend_data']).toBe('latest-answer-set');

    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[1]).toBe(86);
    expect(matriculaUpdate?.args[2]).toBe(103);
  });

  it('preserva location numerica do AW e ultimo_slide quando o pacote reabre no inicio', async () => {
    const currentCmi = JSON.stringify({
      'cmi.location': '238',
      'cmi.core.lesson_location': '238',
      'cmi.core.lesson_status': 'incomplete',
    });
    const staleCmi = JSON.stringify({
      'cmi.location': '1/380',
      'cmi.core.lesson_location': '1/380',
      'cmi.core.lesson_status': 'incomplete',
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 326,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 1,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'AW139 - Manutenção',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 100,
            score_max: null,
            score_min: 0,
            score_scaled: null,
            session_time: '00:00:00',
            total_time: null,
            suspend_data: null,
            launch_data: null,
            cmi_json: currentCmi,
          }),
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 326,
          lesson_status: 'incomplete',
          score_raw: 100,
          cmi_json: staleCmi,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const scormUpsert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO lms_progresso_scorm'),
    );
    expect(scormUpsert?.args[13]).toBe(currentCmi);

    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[2]).toBe(238);
  });

  it('preserva a location forte do AW e aceita suspend_data mais novo durante prova', async () => {
    const currentCmi = JSON.stringify({
      'cmi.location': '238',
      'cmi.core.lesson_location': '238',
      'cmi.suspend_data': 'checkpoint-modulo-4',
      'cmi.core.lesson_status': 'incomplete',
    });
    const incomingCmi = JSON.stringify({
      'cmi.location': '1/380',
      'cmi.core.lesson_location': '1/380',
      'cmi.suspend_data': 'checkpoint-modulo-4-quiz-q7',
      'cmi.core.lesson_status': 'incomplete',
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 912,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 62,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'AW139',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 62,
            score_max: 100,
            score_min: 0,
            score_scaled: 0.62,
            session_time: '0000:05:00.00',
            total_time: '0001:00:00.00',
            suspend_data: 'checkpoint-modulo-4',
            launch_data: null,
            cmi_json: currentCmi,
          }),
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 912,
          lesson_status: 'incomplete',
          score_raw: 62,
          score_max: 100,
          suspend_data: 'checkpoint-modulo-4-quiz-q7',
          cmi_json: incomingCmi,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const scormUpsert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO lms_progresso_scorm'),
    );
    expect(scormUpsert?.args[11]).toBe('checkpoint-modulo-4-quiz-q7');
    const mergedCmi = JSON.parse(String(scormUpsert?.args[13]));
    expect(mergedCmi['cmi.location']).toBe('238');
    expect(mergedCmi['cmi.core.lesson_location']).toBe('238');
    expect(mergedCmi['cmi.suspend_data']).toBe('checkpoint-modulo-4-quiz-q7');
  });

  it('nao deixa suspend_data vazio apagar o checkpoint forte da prova', async () => {
    const currentCmi = JSON.stringify({
      'cmi.location': '44/380',
      'cmi.core.lesson_location': '44/380',
      'cmi.suspend_data': 'quiz-checkpoint-state',
      'cmi.core.lesson_status': 'incomplete',
    });
    const incomingCmi = JSON.stringify({
      'cmi.location': '44/380',
      'cmi.core.lesson_location': '44/380',
      'cmi.core.lesson_status': 'incomplete',
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 913,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 12,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'AW139',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 12,
            score_max: 100,
            score_min: 0,
            score_scaled: 0.12,
            session_time: '0000:02:00.00',
            total_time: '0000:20:00.00',
            suspend_data: 'quiz-checkpoint-state',
            launch_data: null,
            cmi_json: currentCmi,
          }),
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 913,
          lesson_status: 'incomplete',
          score_raw: 12,
          score_max: 100,
          suspend_data: '',
          cmi_json: incomingCmi,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    const scormUpsert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO lms_progresso_scorm'),
    );
    expect(scormUpsert?.args[11]).toBe('quiz-checkpoint-state');
    const mergedCmi = JSON.parse(String(scormUpsert?.args[13]));
    expect(mergedCmi['cmi.suspend_data']).toBe('quiz-checkpoint-state');
  });

  it('conclui commit SCORM 1.2 quando lesson_status=completed e score atende mastery', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 163,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 0,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 125,
            curso_titulo: 'MGM - Manual Geral de Manutenção',
            qualificacao_codigo: 'MNT_MGM',
            qualificacao_nome: 'MGM - Manual Geral de Manutenção',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created',
      qualificacaoHistoricoId: 9001,
      matriculaId: 163,
    });

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 163,
          lesson_status: 'completed',
          score_raw: 85,
          score_max: 100,
          cmi_json: JSON.stringify({
            'cmi.core.lesson_status': 'completed',
            'cmi.core.score.raw': '85',
          }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 163,
        novo_status: 'CONCLUIDO',
        progresso_pct: 100,
        qualificacao_gerada: {
          qualificacao_historico_id: 9001,
        },
      },
    });

    expect(completeLmsMatriculaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matriculaId: 163,
        qualificacaoTipoId: 125,
        progressoPct: 100,
      }),
    );
  });

  it('conclui commit SCORM 2004 quando completion_status=completed e success_status=passed', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 164,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 40,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'SCORM 2004 Teste',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 164,
          completion_status: 'completed',
          success_status: 'passed',
          score_raw: 92,
          score_max: 100,
          score_scaled: 0.92,
          cmi_json: JSON.stringify({
            'cmi.completion_status': 'completed',
            'cmi.success_status': 'passed',
            'cmi.score.raw': '92',
          }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 164,
        novo_status: 'CONCLUIDO',
        progresso_pct: 100,
      },
    });
  });

  it('nao conclui commit SCORM completed quando o score fica abaixo do mastery score', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 165,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 55,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'MGM - Manual Geral de Manutenção',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 165,
          lesson_status: 'completed',
          score_raw: 45,
          score_max: 100,
          cmi_json: JSON.stringify({
            'cmi.core.lesson_status': 'completed',
            'cmi.core.score.raw': '45',
          }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 165,
        novo_status: 'EM_ANDAMENTO',
      },
    });

    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[0]).toBe('EM_ANDAMENTO');
    expect(matriculaUpdate?.args[1]).toBe(55);
  });

  it('conclui SCORM 1.2 no Finish confiavel quando mastery e slide final foram confirmados', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 326,
            empresa_id: 1,
            funcionario_id: 80,
            status: 'EM_ANDAMENTO',
            progresso_pct: 63,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 130,
            curso_titulo: 'AW139 - Manutencao',
            qualificacao_codigo: 'MNT_AW139',
            qualificacao_nome: 'AW139 - Manutencao',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 36,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 95,
            score_max: 100,
            score_min: 0,
            score_scaled: 0.95,
            session_time: '0000:10:00.00',
            total_time: '0001:00:00.00',
            suspend_data: 'checkpoint-final',
            launch_data: null,
            cmi_json: JSON.stringify({
              'cmi.location': '379/380',
              'cmi.core.lesson_location': '379/380',
            }),
          }),
        },
      ],
      [
        'INSERT INTO lms_progresso_scorm',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 0 } }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 326,
          lesson_status: 'incomplete',
          score_raw: 100,
          score_max: 100,
          score_scaled: 1,
          suspend_data: 'checkpoint-final-quiz',
          commit_event: 'SCORM_FINISH',
          completion_candidate: true,
          completion_observed_at: '2026-06-24T12:00:00.000Z',
          cmi_json: JSON.stringify({
            'cmi.location': '380/380',
            'cmi.core.lesson_location': '380/380',
            'cmi.core.lesson_status': 'incomplete',
            'cmi.core.score.raw': '100',
          }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 326,
        novo_status: 'CONCLUIDO',
        qualificacao_gerada: null,
        completion_diagnostic: {
          status: 'accepted',
          code: 'SCORM_COMPLETION_ACCEPTED',
          can_finalize: false,
          reached_final_location: true,
          final_commit_observed: true,
        },
      },
    });
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'SCORM_COMPLETION_ACCEPTED',
        entityId: 326,
      }),
    );
  });

  it('trata Finish duplicado de matrícula já concluída como idempotente e não regride estado', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 326,
            empresa_id: 1,
            funcionario_id: 80,
            status: 'CONCLUIDO',
            progresso_pct: 100,
            tentativas: 1,
            qualificacao_historico_id: 9001,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 130,
            curso_id: 32,
            curso_titulo: 'AW139 - Manutencao',
            qualificacao_codigo: 'MNT_AW139',
            qualificacao_nome: 'AW139 - Manutencao',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 36,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 96,
            score_max: 100,
            score_min: 0,
            score_scaled: 0.96,
            session_time: '0000:10:00.00',
            total_time: '0001:00:00.00',
            suspend_data: 'checkpoint-final-aw139',
            launch_data: null,
            cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '405/405' }),
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);
    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 326,
          lesson_status: 'incomplete',
          score_raw: 96,
          score_max: 100,
          commit_event: 'SCORM_FINISH',
          completion_candidate: true,
          completion_observed_at: '2026-08-12T18:42:00.000Z',
          cmi_json: JSON.stringify({ 'cmi.core.lesson_location': '405/405' }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        status: 'CONCLUIDO',
        progresso_pct: 100,
        ignoredDowngrade: true,
      },
    });
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
    expect(calls.some((call) => call.method === 'run')).toBe(false);
  });

  it('bloqueia finalizacao manual sem evidencia SCORM suficiente', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 400,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 40,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 127,
            scorm_mastery_score: 70,
            curso_titulo: 'Inspecao IIO & APRS',
            qualificacao_codigo: 'MNT_IIO_APRS',
            qualificacao_nome: 'Inspecao IIO & APRS',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 36,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 40,
            score_max: 100,
            score_scaled: 0.4,
            session_time: '0000:02:00.00',
            total_time: '0000:15:00.00',
            suspend_data: 'checkpoint-modulo-2',
            cmi_json: JSON.stringify({
              'cmi.location': '12/80',
              'cmi.core.lesson_location': '12/80',
              'cmi.core.score.raw': '40',
            }),
          }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/400/finalizar', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SCORM_COMPLETION_REJECTED',
      data: {
        matricula_id: 400,
        novo_status: 'EM_ANDAMENTO',
        completion_diagnostic: {
          can_finalize: false,
        },
      },
    });
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('rejeita finalizacao manual quando ha apenas candidate auditavel sem passed/completed explicito', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_created',
      qualificacaoHistoricoId: 9001,
      matriculaId: 401,
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 401,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 99,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 130,
            scorm_mastery_score: 70,
            curso_titulo: 'AW139 - Manutencao',
            qualificacao_codigo: 'MNT_AW139',
            qualificacao_nome: 'AW139 - Manutencao',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 36,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => ({
            lesson_status: 'incomplete',
            completion_status: null,
            success_status: null,
            score_raw: 100,
            score_max: 100,
            score_scaled: 1,
            session_time: '0000:10:00.00',
            total_time: '0001:20:00.00',
            suspend_data: 'checkpoint-final-quiz',
            cmi_json: JSON.stringify({
              'cmi.location': '380/380',
              'cmi.core.lesson_location': '380/380',
              'cmi.core.score.raw': '100',
            }),
          }),
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/401/finalizar', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: 'SCORM_COMPLETION_REJECTED',
      data: {
        matricula_id: 401,
        novo_status: 'EM_ANDAMENTO',
        completion_diagnostic: {
          status: 'candidate',
          explicit_completion: false,
        },
      },
    });
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
    expect(
      calls.some((call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas')),
    ).toBe(false);
  });

  it('preserva a finalizacao manual de conteúdo não qualificante', async () => {
    completeLmsMatriculaMock.mockResolvedValue({
      outcome: 'qualification_not_required',
      qualificacaoHistoricoId: null,
      matriculaId: 402,
    });

    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 402,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 100,
            qualificacao_historico_id: null,
            tipo_conteudo: 'pdf',
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            scorm_mastery_score: null,
            curso_titulo: 'Manual PDF',
            qualificacao_codigo: 'PDF_MANUAL',
            qualificacao_nome: 'Manual PDF',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 24,
          }),
        },
      ],
      [
        'FROM lms_progresso_scorm',
        {
          first: () => null,
        },
      ],
      [
        'UPDATE lms_matriculas',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/402/finalizar', {
        method: 'POST',
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 402,
        novo_status: 'CONCLUIDO',
        progresso_pct: 100,
        qualificacao_gerada: null,
      },
    });
    expect(completeLmsMatriculaMock).toHaveBeenCalledTimes(1);
  });

  it('PATCH PDF 100 seguido de finalizar não emite qualificação nem certificado sem evidência server-side', async () => {
    let progress = 0;
    const db = {
      prepare: vi.fn((query: string) => {
        const result = {
          __sql: query,
          first: async () => {
            if (query.includes('FROM lms_matriculas m')) {
              return {
                id: 402,
                empresa_id: 1,
                funcionario_id: 77,
                status: 'EM_ANDAMENTO',
                progresso_pct: progress,
                qualificacao_historico_id: null,
                curso_id: 131,
                tipo_conteudo: 'pdf',
                ativo: 1,
                publicado: 1,
                scorm_mastery_score: null,
                scorm_package_r2_prefix: null,
                scorm_launch_file: null,
                gerar_qualificacao_ao_concluir: 1,
                lesson_status: null,
                completion_status: null,
                success_status: null,
                score_raw: null,
                score_min: null,
                score_max: null,
                score_scaled: null,
                session_time: null,
                total_time: null,
                suspend_data: null,
                cmi_json: null,
                xapi_count: 0,
              };
            }
            if (query.includes('SELECT id, status, funcionario_id, progresso_pct')) {
              return {
                id: 402,
                status: 'EM_ANDAMENTO',
                funcionario_id: 77,
                progresso_pct: progress,
                ultimo_slide: 0,
                ultima_pagina: 0,
              };
            }
            if (query.includes('SELECT id, status, progresso_pct, ultimo_slide, ultima_pagina')) {
              return {
                id: 402,
                status: 'EM_ANDAMENTO',
                progresso_pct: progress,
                ultimo_slide: 0,
                ultima_pagina: 0,
              };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return {
          ...result,
          bind: () => result,
        };
      }),
      batch: vi.fn(async () => {
        progress = 100;
        return [];
      }),
    } as unknown as D1Database;

    const app = new Hono<{ Bindings: Env }>();
    app.use('*', async (c, next) => {
      c.set('empresaId' as never, 1 as never);
      c.set('userId' as never, 42 as never);
      c.set('funcionarioId' as never, 77 as never);
      const guarded = await enforceLmsCompletionIntegrity(c as never);
      if (guarded) return guarded;
      return next();
    });
    app.route('/api/lms/matriculas', lmsMatriculasRoutes);

    const progressResponse = await app.fetch(
      new Request('http://localhost/api/lms/matriculas/402/progresso', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progresso_pct: 100 }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(progressResponse.status).toBe(200);
    expect(progress).toBe(100);

    const finalizeResponse = await app.fetch(
      new Request('http://localhost/api/lms/matriculas/402/finalizar', { method: 'POST' }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );
    expect(finalizeResponse.status).toBe(409);
    await expect(finalizeResponse.json()).resolves.toMatchObject({
      success: false,
      code: 'CONTENT_EVIDENCE_REQUIRED',
      data: { matricula_id: 402 },
    });
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
  });

  it('nao usa a nota do quiz como progresso quando o pacote informa localizacao real', async () => {
    // Regressão observada em produção: pacotes com quiz por capítulo enviam
    // score.raw=100/score.max=100 já no primeiro módulo. Como o progresso é
    // monotônico, isso fixava a matrícula em 100% enquanto o aluno estava no
    // início do curso, e o pacote seguia reportando `incomplete`.
    const cmi = JSON.stringify({
      'cmi.core.lesson_location': '10/108',
      'cmi.core.lesson_status': 'incomplete',
    });

    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 700,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 0,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'PT6C-67C - Manutenção',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      ['FROM lms_progresso_scorm', { first: () => null }],
      [
        'INSERT INTO lms_progresso_scorm',
        { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) },
      ],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 700,
          lesson_status: 'incomplete',
          score_raw: 100,
          score_max: 100,
          cmi_json: cmi,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    // 10/108 ≈ 9%, e não 100% vindo da nota.
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        matricula_id: 700,
        novo_status: 'EM_ANDAMENTO',
        progresso_pct: 9,
      },
    });
    // A matrícula não pode ser marcada como concluída por nota alta.
    expect(completeLmsMatriculaMock).not.toHaveBeenCalled();
    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[1]).toBe(9);
  });

  it('ainda usa a nota como progresso quando o pacote nao envia localizacao alguma', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 701,
            empresa_id: 1,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            progresso_pct: 0,
            tentativas: 0,
            qualificacao_historico_id: null,
            scorm_mastery_score: 70,
            gerar_qualificacao_ao_concluir: 0,
            qualificacao_tipo_id: null,
            curso_titulo: 'Curso sem location',
            qualificacao_codigo: null,
            qualificacao_nome: null,
            qualificacao_categoria: null,
            qualificacao_validade: null,
          }),
        },
      ],
      ['FROM lms_progresso_scorm', { first: () => null }],
      [
        'INSERT INTO lms_progresso_scorm',
        { run: () => ({ meta: { changes: 1, last_row_id: 0 } }) },
      ],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsMatriculasRoutes);

    const response = await app.fetch(
      new Request('http://localhost/scorm/commit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 701,
          lesson_status: 'incomplete',
          score_raw: 40,
          score_max: 100,
          cmi_json: JSON.stringify({ 'cmi.core.lesson_status': 'incomplete' }),
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { matricula_id: 701, novo_status: 'EM_ANDAMENTO', progresso_pct: 40 },
    });
  });
});
