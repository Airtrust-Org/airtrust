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
});
