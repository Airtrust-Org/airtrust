import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  createLmsQualificationOnCompletionMock,
  syncMatriculaCycleFromMatriculaMock,
  logAuditMock,
} = vi.hoisted(() => ({
  createLmsQualificationOnCompletionMock: vi.fn(),
  syncMatriculaCycleFromMatriculaMock: vi.fn(),
  logAuditMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  hasRole: () => true,
}));

vi.mock('../../routes/escalas-shared', () => ({
  getEmpresaIdSafe: () => 1,
}));

vi.mock('../../services/lms-qualification', () => ({
  createLmsQualificationOnCompletion: createLmsQualificationOnCompletionMock,
}));

vi.mock('../../services/lms-matricula-cycle', () => ({
  syncMatriculaCycleFromMatricula: syncMatriculaCycleFromMatriculaMock,
}));

vi.mock('../../utils/db', () => ({
  logAudit: logAuditMock,
}));

import lmsProgressoRoutes from '../../routes/lms-progresso';

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

describe('lms progresso xapi router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createLmsQualificationOnCompletionMock.mockResolvedValue(9001);
    syncMatriculaCycleFromMatriculaMock.mockResolvedValue(undefined);
    logAuditMock.mockResolvedValue(undefined);
  });

  it('concludes on completed verb even when xAPI result flags are omitted', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            empresa_id: 1,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'FDM - Flight Data Monitoring',
            qualificacao_codigo: 'FDM_FLIGHT_DATA_MONITORING',
            qualificacao_nome: 'FDM - Flight Data Monitoring',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 501 } }),
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
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: {
            id: 'http://adlnet.gov/expapi/verbs/completed',
            display: { 'en-US': 'completed' },
          },
          object: {
            id: 'h5p:20',
            objectType: 'Activity',
          },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        statement_id: 501,
        matricula_id: 10,
        novo_status: 'CONCLUIDO',
        qualificacao_gerada: {
          qualificacao_historico_id: 9001,
        },
      },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(updateCall?.args[0]).toBe('CONCLUIDO');
    expect(updateCall?.args[1]).toBe(100);
    expect(createLmsQualificationOnCompletionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matriculaId: 10,
        funcionarioId: 77,
        qualificacaoTipoId: 55,
      }),
    );
  });

  it('does not regress a completed matrícula on later failed xAPI statements', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'CONCLUIDO',
            empresa_id: 1,
            progresso_pct: 100,
            score_final: 92,
            qualificacao_historico_id: 300,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'AW139',
            qualificacao_codigo: 'AW139',
            qualificacao_nome: 'AW139',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 777 } }),
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
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: {
            id: 'http://adlnet.gov/expapi/verbs/failed',
            display: { 'en-US': 'failed' },
          },
          object: {
            id: 'h5p:20',
            objectType: 'Activity',
          },
          result: {
            success: false,
            score: { raw: 10, max: 100 },
          },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        statement_id: 777,
        matricula_id: 10,
        novo_status: 'CONCLUIDO',
      },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('UPDATE lms_matriculas'),
    );
    expect(updateCall?.args[0]).toBe('CONCLUIDO');
    expect(updateCall?.args[1]).toBe(100);
    expect(updateCall?.args[3]).toBe(92);
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });

  it('blocks completion when score is below scorm_mastery_score (BUG-006)', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            empresa_id: 1,
            progresso_pct: 50,
            score_final: null,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'FDM - Flight Data Monitoring',
            scorm_mastery_score: 70,
            qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 601 } }),
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
    app.route('/', lmsProgressoRoutes);

    // completed verb with score 50% — below mastery score 70
    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: {
            id: 'http://adlnet.gov/expapi/verbs/completed',
            display: { 'en-US': 'completed' },
          },
          object: {
            id: 'h5p:20',
            objectType: 'Activity',
          },
          result: {
            success: true,
            completion: true,
            score: { raw: 50, max: 100 },
          },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data.novo_status).not.toBe('CONCLUIDO');
    expect(body.data.qualificacao_gerada).toBeNull();

    // Qualification should NOT be generated
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });

  it('allows completion when score meets scorm_mastery_score', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            empresa_id: 1,
            progresso_pct: 80,
            score_final: null,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'FDM - Flight Data Monitoring',
            scorm_mastery_score: 70,
            qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 602 } }),
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
    app.route('/', lmsProgressoRoutes);

    // passed verb with score 85% — above mastery score 70
    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: {
            id: 'http://adlnet.gov/expapi/verbs/passed',
            display: { 'en-US': 'passed' },
          },
          object: {
            id: 'h5p:20',
            objectType: 'Activity',
          },
          result: {
            success: true,
            score: { raw: 85, max: 100 },
          },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        statement_id: 602,
        matricula_id: 10,
        novo_status: 'CONCLUIDO',
      },
    });

    expect(createLmsQualificationOnCompletionMock).toHaveBeenCalledTimes(1);
  });

  it('blocks completion on completed verb without score when mastery=70 (score required)', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10,
            funcionario_id: 77,
            status: 'EM_ANDAMENTO',
            empresa_id: 1,
            progresso_pct: 50,
            score_final: null,
            qualificacao_historico_id: null,
            gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55,
            curso_titulo: 'FDM',
            scorm_mastery_score: 70,
            qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM',
            qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      [
        'INSERT INTO lms_xapi_statements',
        { run: () => ({ meta: { changes: 1, last_row_id: 701 } }) },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
          // No result.score — mastery score check should fail-closed
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    const body = await response.json();
    expect(body.data.novo_status).not.toBe('CONCLUIDO');
    expect(body.data.qualificacao_gerada).toBeNull();
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });

  it('allows completion when score equals mastery (raw=70, max=100, mastery=70)', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10, funcionario_id: 77, status: 'EM_ANDAMENTO',
            empresa_id: 1, progresso_pct: 50, score_final: null,
            qualificacao_historico_id: null, gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55, curso_titulo: 'FDM',
            scorm_mastery_score: 70, qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM', qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      ['INSERT INTO lms_xapi_statements', { run: () => ({ meta: { changes: 1, last_row_id: 702 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { 'en-US': 'passed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
          result: { success: true, score: { raw: 70, max: 100 } },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { novo_status: 'CONCLUIDO' },
    });
    expect(createLmsQualificationOnCompletionMock).toHaveBeenCalled();
  });

  it('allows completion when scaled=0.7 with mastery=70', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10, funcionario_id: 77, status: 'EM_ANDAMENTO',
            empresa_id: 1, progresso_pct: 50, score_final: null,
            qualificacao_historico_id: null, gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55, curso_titulo: 'FDM',
            scorm_mastery_score: 70, qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM', qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      ['INSERT INTO lms_xapi_statements', { run: () => ({ meta: { changes: 1, last_row_id: 703 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { 'en-US': 'passed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
          result: { success: true, score: { scaled: 0.7 } },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { novo_status: 'CONCLUIDO' },
    });
  });

  it('allows completion when raw=7, max=10 (70%) with mastery=70', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10, funcionario_id: 77, status: 'EM_ANDAMENTO',
            empresa_id: 1, progresso_pct: 50, score_final: null,
            qualificacao_historico_id: null, gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55, curso_titulo: 'FDM',
            scorm_mastery_score: 70, qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM', qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      ['INSERT INTO lms_xapi_statements', { run: () => ({ meta: { changes: 1, last_row_id: 704 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { 'en-US': 'passed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
          result: { success: true, score: { raw: 7, max: 10 } },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    await expect(response.json()).resolves.toMatchObject({
      success: true, data: { novo_status: 'CONCLUIDO' },
    });
  });

  it('blocks completion when raw=6, max=10 (60%) below mastery=70', async () => {
    const { db } = createMockDb([
      [
        'FROM lms_matriculas m',
        {
          first: () => ({
            id: 10, funcionario_id: 77, status: 'EM_ANDAMENTO',
            empresa_id: 1, progresso_pct: 50, score_final: null,
            qualificacao_historico_id: null, gerar_qualificacao_ao_concluir: 1,
            qualificacao_tipo_id: 55, curso_titulo: 'FDM',
            scorm_mastery_score: 70, qualificacao_codigo: 'FDM',
            qualificacao_nome: 'FDM', qualificacao_categoria: 'EAD',
            qualificacao_validade: 12,
          }),
        },
      ],
      ['INSERT INTO lms_xapi_statements', { run: () => ({ meta: { changes: 1, last_row_id: 705 } }) }],
      ['UPDATE lms_matriculas', { run: () => ({ meta: { changes: 1 } }) }],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/', lmsProgressoRoutes);

    const response = await app.fetch(
      new Request('http://localhost/xapi/statements', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          matricula_id: 10,
          actor: { mbox: 'mailto:aluno@airtrust.online' },
          verb: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { 'en-US': 'passed' } },
          object: { id: 'h5p:20', objectType: 'Activity' },
          result: { success: true, score: { raw: 6, max: 10 } },
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    const body = await response.json();
    expect(body.data.novo_status).not.toBe('CONCLUIDO');
    expect(body.data.qualificacao_gerada).toBeNull();
    expect(createLmsQualificationOnCompletionMock).not.toHaveBeenCalled();
  });
});
