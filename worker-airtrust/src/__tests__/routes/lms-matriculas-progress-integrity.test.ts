import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

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
  hasActiveMatriculaCycle: (record: { status?: string | null; deleted_at?: string | null } | null) =>
    Boolean(record && !record.deleted_at && ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(record.status))),
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
    createLmsQualificationOnCompletionMock.mockResolvedValue(null);
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
        'SELECT id, nome\n         FROM funcionarios',
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
    const scormUpsert = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO lms_progresso_scorm'),
    );
    expect(scormUpsert?.args[11]).toBe('latest-answer-set');
    expect(scormUpsert?.args[13]).toBe(currentCmi);

    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[1]).toBe(80);
    expect(matriculaUpdate?.args[2]).toBe(103);
  });

  it('conclui commit SCORM 1.2 quando lesson_status=completed e score atende mastery', async () => {
    const { db, calls } = createMockDb([
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

    createLmsQualificationOnCompletionMock.mockResolvedValue(9001);

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

    expect(createLmsQualificationOnCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matriculaId: 163,
        qualificacaoTipoId: 125,
      }),
    );
    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[0]).toBe('CONCLUIDO');
    expect(matriculaUpdate?.args[1]).toBe(100);
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

    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
    const matriculaUpdate = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(matriculaUpdate?.args[0]).toBe('EM_ANDAMENTO');
    expect(matriculaUpdate?.args[1]).toBe(55);
  });
});
