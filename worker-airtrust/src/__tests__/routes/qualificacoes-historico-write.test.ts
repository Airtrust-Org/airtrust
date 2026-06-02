import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  historicoPertenceEmpresaMock,
  invalidateMaterializedStatsMock,
  ensureHistoricoSchemaMock,
  ensureQualificacoesTiposTrainingSchemaMock,
  registrarAuditoriaMock,
  publishQualificacaoEventMock,
  calcularDataVencimentoMock,
} = vi.hoisted(() => ({
  historicoPertenceEmpresaMock: vi.fn(),
  invalidateMaterializedStatsMock: vi.fn(),
  ensureHistoricoSchemaMock: vi.fn(),
  ensureQualificacoesTiposTrainingSchemaMock: vi.fn(),
  registrarAuditoriaMock: vi.fn(),
  publishQualificacaoEventMock: vi.fn(),
  calcularDataVencimentoMock: vi.fn(),
}));

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/rbac', () => ({
  requireRole: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

vi.mock('../../middleware/tenant', () => ({
  getTenantContext: () => ({ empresaId: 1 }),
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
  extrairUsuarioAuditoria: () => ({ usuario_id: 99, origem: 'test' }),
}));

vi.mock('../../services/qualificacoes-g1-sem', () => ({
  garantirG1SemPlanejado: vi.fn(),
  isG1QualificacaoCode: vi.fn(() => false),
  isG1SemQualificacaoCode: vi.fn(() => false),
  realizarG1SemPendente: vi.fn(),
}));

vi.mock('../../routes/qualificacoes/historico-helpers', () => ({
  safe: <T>(handler: T) => handler,
  historicoPertenceEmpresa: historicoPertenceEmpresaMock,
  invalidateMaterializedStats: invalidateMaterializedStatsMock,
  ensureHistoricoSchema: ensureHistoricoSchemaMock,
  ensureQualificacoesTiposTrainingSchema: ensureQualificacoesTiposTrainingSchemaMock,
  normalizeTipoTreinamento: (value: unknown) =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim().toUpperCase() : null,
  resolveCargaHorariaByTipo: () => 8,
  calcularDataVencimento: calcularDataVencimentoMock,
  resolveParametrosRenovacaoQualificacao: () => ({
    validadeMeses: 12,
    dataVencimento: '2026-12-31',
    tipoTreinamento: 'RECORRENTE',
    status: 'CONCLUIDA',
  }),
  publishQualificacaoEvent: publishQualificacaoEventMock,
}));

import writeRouter from '../../routes/qualificacoes/historico-write';

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

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      const executeRun = async (args: unknown[]) => {
        calls.push({ query, args, method: 'run' });
        return handler.run ? handler.run(args) : { meta: { changes: 1, last_row_id: 0 } };
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        run: async () => executeRun([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualificacoes historico write router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    historicoPertenceEmpresaMock.mockResolvedValue({ id: 123 });
    invalidateMaterializedStatsMock.mockResolvedValue(undefined);
    ensureHistoricoSchemaMock.mockResolvedValue(undefined);
    ensureQualificacoesTiposTrainingSchemaMock.mockResolvedValue(undefined);
    registrarAuditoriaMock.mockResolvedValue(undefined);
    publishQualificacaoEventMock.mockResolvedValue(undefined);
    calcularDataVencimentoMock.mockImplementation(
      ({ dataVencimento }: { dataVencimento?: string | null }) => dataVencimento ?? '2026-07-15',
    );
  });

  it('reaplica o instrutor quando o readback inicial volta nulo', async () => {
    let readbackCount = 0;
    const { db, calls } = createMockDb([
      [
        'LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL',
        {
          first: () => ({
            tipo_treinamento: 'RECORRENTE',
            carga_horaria: 4,
            validade_meses: 12,
            data_vencimento: '2026-07-15',
            qualificacao_codigo: 'SIM',
            validade: 12,
            carga_horaria_inicial: 4,
            carga_horaria_recorrente: 8,
          }),
        },
      ],
      [
        'SET data_conclusao = ?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT id, data_conclusao, data_vencimento, observacoes, instrutor,',
        {
          first: () => {
            readbackCount += 1;
            return {
              id: 123,
              data_conclusao: '2026-01-15',
              data_vencimento: '2026-07-15',
              observacoes: 'ajuste manual',
              instrutor: readbackCount === 1 ? null : 'Cap. Silva',
              tipo_treinamento: 'RECORRENTE',
              carga_horaria: 8,
            };
          },
        },
      ],
      [
        'SET instrutor = ?,',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT funcionario_id, qualificacao_codigo FROM qualificacoes_historico WHERE id = ? AND deleted_at IS NULL',
        {
          first: () => ({ funcionario_id: 44, qualificacao_codigo: 'SIM' }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/historico', writeRouter);

    const response = await app.fetch(
      new Request('http://localhost/historico/123', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          data_conclusao: '2026-01-15',
          data_vencimento: '2026-07-15',
          observacoes: 'ajuste manual',
          instrutor: '  Cap. Silva  ',
          tipo_treinamento: 'recorrente',
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 123,
        data_conclusao: '2026-01-15',
        data_vencimento: '2026-07-15',
        observacoes: 'ajuste manual',
        instrutor: 'Cap. Silva',
        tipo_treinamento: 'RECORRENTE',
        carga_horaria: 8,
      },
    });

    const updateCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('SET data_conclusao = ?,'),
    );
    expect(updateCall?.args).toEqual([
      '2026-01-15',
      '2026-07-15',
      'Cap. Silva',
      'ajuste manual',
      'RECORRENTE',
      8,
      123,
    ]);

    const retryCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('SET instrutor = ?,'),
    );
    expect(retryCall?.args).toEqual(['Cap. Silva', 123]);
    expect(publishQualificacaoEventMock).toHaveBeenCalledWith(
      db,
      'renewed',
      44,
      'SIM',
      expect.objectContaining({ registro_id: 123, data_conclusao: '2026-01-15' }),
    );
  });

  it('cria uma qualificacao com data futura como planejada', async () => {
    const { db, calls } = createMockDb([
      [
        'SELECT id, categoria, validade, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente FROM qualificacoes_tipos WHERE codigo = ?',
        {
          first: () => ({
            id: 19,
            categoria: 'OPS',
            validade: 12,
            carga_horaria: 8,
            carga_horaria_inicial: 8,
            carga_horaria_recorrente: 8,
          }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ meta: { changes: 1, last_row_id: 501 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/historico', writeRouter);

    const response = await app.fetch(
      new Request('http://localhost/historico', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          funcionario_id: 42,
          qualificacao_codigo: 'PBN',
          data_conclusao: '2099-12-15',
          status: 'CONCLUIDA',
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
        funcionario_id: 42,
        qualificacao_id: 19,
        qualificacao_codigo: 'PBN',
        status: 'PLANEJADA',
        data_conclusao: '2099-12-15',
      },
    });

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall?.args).toEqual([
      42,
      19,
      'PBN',
      'OPS',
      '2099-12-15',
      '2026-07-15',
      null,
      null,
      null,
      'PLANEJADA',
      8,
      'INICIAL',
    ]);
    expect(publishQualificacaoEventMock).toHaveBeenCalledWith(
      db,
      'created',
      42,
      'PBN',
      expect.objectContaining({ registro_id: 501, data_conclusao: '2099-12-15' }),
    );
  });

  it('confirma uma qualificacao planejada e marca a anterior como renovada', async () => {
    historicoPertenceEmpresaMock.mockResolvedValueOnce({
      id: 321,
      funcionario_id: 77,
      qualificacao_codigo: 'PBN',
      status: 'PLANEJADA',
    });

    const { db, calls } = createMockDb([
      [
        "SET status = 'CONCLUIDA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        "COALESCE(status, 'CONCLUIDA') = 'CONCLUIDA'",
        {
          first: () => ({ id: 222 }),
        },
      ],
      [
        "SET renovada = 1,\n                    status = 'RENOVADA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/historico', writeRouter);

    const response = await app.fetch(
      new Request('http://localhost/historico/321/confirmar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ renovar_anterior: true }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 321,
        status: 'CONCLUIDA',
        registro_anterior_renovado_id: 222,
      },
    });

    const renovarCall = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes('SET renovada = 1') &&
        call.query.includes("status = 'RENOVADA'"),
    );
    expect(renovarCall?.args).toEqual([222]);
    expect(publishQualificacaoEventMock).toHaveBeenCalledWith(
      db,
      'created',
      77,
      'PBN',
      expect.objectContaining({ registro_id: 321, status: 'CONCLUIDA' }),
    );
  });

  it('reagenda uma qualificacao planejada para uma nova data futura', async () => {
    calcularDataVencimentoMock.mockReturnValue('2027-05-10');
    historicoPertenceEmpresaMock.mockResolvedValueOnce({
      id: 654,
      funcionario_id: 88,
      qualificacao_codigo: 'CRM',
      status: 'PLANEJADA',
    });

    const { db, calls } = createMockDb([
      [
        'SELECT qt.validade_meses, qt.validade, qt.data_vencimento, qt.qualificacao_codigo',
        {
          first: () => ({
            validade_meses: 12,
            validade: 12,
            data_vencimento: null,
            qualificacao_codigo: 'CRM',
          }),
        },
      ],
      [
        "SET data_conclusao = ?,\n                data_vencimento = ?,\n                status = 'PLANEJADA'",
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/historico', writeRouter);

    const response = await app.fetch(
      new Request('http://localhost/historico/654/reagendar', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nova_data_planejada: '2099-05-10' }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: 654,
        status: 'PLANEJADA',
        data_conclusao: '2099-05-10',
        data_vencimento: '2027-05-10',
      },
    });

    const updateCall = calls.find(
      (call) =>
        call.method === 'run' &&
        call.query.includes('SET data_conclusao = ?') &&
        call.query.includes("status = 'PLANEJADA'"),
    );
    expect(updateCall?.args).toEqual(['2099-05-10', '2027-05-10', 654]);
  });
});
