import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

const {
  invalidateMaterializedStatsMock,
  registrarAuditoriaMock,
} = vi.hoisted(() => ({
  invalidateMaterializedStatsMock: vi.fn(),
  registrarAuditoriaMock: vi.fn(),
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
  getTenantContext: () => ({ empresaId: 7 }),
}));

vi.mock('../../routes/qualificacoes/shared', () => ({
  invalidateMaterializedStats: invalidateMaterializedStatsMock,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
  extrairUsuarioAuditoria: () => ({
    usuario_id: '55',
    usuario_nome: 'Teste',
    ip_address: '127.0.0.1',
    user_agent: 'vitest',
  }),
}));

vi.mock('../../services/lms-ead-ssot', () => ({
  isEadCategoria: (categoria: string | null | undefined) =>
    String(categoria || '').trim().toUpperCase() === 'EAD' ||
    String(categoria || '').trim().toUpperCase() === 'TREINAMENTO EAD',
  isEadFormato: ({
    formato_codigo,
    categoria,
  }: {
    formato_codigo?: string | null;
    categoria?: string | null;
  }) =>
    formato_codigo != null
      ? String(formato_codigo).trim().toUpperCase() === 'EAD'
      : String(categoria || '').trim().toUpperCase() === 'EAD' ||
        String(categoria || '').trim().toUpperCase() === 'TREINAMENTO EAD',
  reconcileImportedEdappHistory: vi.fn(),
  softDeleteLmsCourseForQualificacaoTipo: vi.fn(),
  syncLmsCourseFromQualificacaoTipo: vi.fn(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  filterRequestedSetorIdsByAccess: vi.fn((ids) => ids),
  getEmployeeSectorAccess: vi.fn(async () => ({ isAdmin: true, allowedSetorIds: [] })),
}));

import {
  softDeleteLmsCourseForQualificacaoTipo,
  syncLmsCourseFromQualificacaoTipo,
} from '../../services/lms-ead-ssot';
import tiposRouter from '../../routes/qualificacoes/tipos';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  run?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'run' | 'all' | 'batch' }> =
    [];
  const normalizeSql = (value: string) => value.replace(/\s+/g, ' ').trim();

  const makeBoundStatement = (query: string, args: unknown[]) => ({
    __sql: query,
    __args: args,
  });

  const db = {
    prepare: vi.fn((query: string) => {
      const normalizedQuery = normalizeSql(query);
      const entry = handlers.find(([matcher]) => normalizedQuery.includes(normalizeSql(matcher)));
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
          __sql: query,
          __args: args,
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
          run: async () => executeRun(args),
        }),
      };
    }),
    batch: vi.fn(async (statements: Array<{ __sql?: string; __args?: unknown[] }>) => {
      calls.push({
        query: statements.map((statement) => statement.__sql).join('\n'),
        args: statements.flatMap((statement) => statement.__args || []),
        method: 'batch',
      });
      return [];
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualificacoes tipos update sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateMaterializedStatsMock.mockResolvedValue(undefined);
    registrarAuditoriaMock.mockResolvedValue(undefined);
  });

  it('recalcula historicos por id e por codigo legado, invalida stats e retorna contagens', async () => {
    const { db, calls } = createMockDb([
      [
        "PRAGMA table_info('qualificacoes_tipos')",
        {
          all: () => ({
            results: [
              { name: 'id' },
              { name: 'codigo' },
              { name: 'validade' },
              { name: 'is_check' },
            ],
          }),
        },
      ],
      [
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        {
          first: () => ({ name: 'auditoria_avancada_v2' }),
        },
      ],
      [
        'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        {
          first: () => ({ id: 10 }),
        },
      ],
      [
        'SELECT id FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND id != ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        {
          first: () => null,
        },
      ],
      [
        'SELECT qt.empresa_id, qt.codigo, qt.nome, qt.categoria, qt.validade, qt.vencimento_fim_mes',
        {
          first: () => ({
            empresa_id: 7,
            categoria: 'MANUTENCAO',
            validade: 12,
            codigo: 'AS350-OLD',
            nome: 'AS350 B2',
            vencimento_fim_mes: 0,
          }),
        },
      ],
      [
        'UPDATE qualificacoes_tipos SET',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT id, codigo, nome, categoria, validade, vencimento_fim_mes,',
        {
          first: () => ({
            id: 10,
            codigo: 'AS350-B2',
            nome: 'AS350 B2',
            categoria: 'MANUTENCAO',
            validade: 24,
            vencimento_fim_mes: 1,
            carga_horaria: null,
            carga_horaria_inicial: null,
            carga_horaria_recorrente: null,
          }),
        },
      ],
      [
        'SELECT qh.id,',
        {
          all: () => ({
            results: [
              {
                id: 101,
                funcionario_id: 1,
                qualificacao_id: 10,
                data_conclusao: '2025-01-15',
                data_vencimento: '2026-01-15',
                tipo_treinamento: 'RECORRENTE',
                qualificacao_codigo: 'AS350-B2',
                tipo_atual: 'AS350 B2',
                categoria_atual: 'MANUTENCAO',
                validade_meses_atual: 12,
                carga_horaria_atual: null,
                nascimento_funcionario: null,
                conflito_codigo: 0,
              },
              {
                id: 202,
                funcionario_id: 2,
                qualificacao_id: null,
                data_conclusao: '2025-02-20',
                data_vencimento: '2026-02-20',
                tipo_treinamento: 'RECORRENTE',
                qualificacao_codigo: 'AS350-OLD',
                tipo_atual: 'AS350 B2',
                categoria_atual: 'MANUTENCAO',
                validade_meses_atual: 12,
                carga_horaria_atual: null,
                nascimento_funcionario: null,
                conflito_codigo: 0,
              },
            ],
          }),
        },
      ],
      [
        'UPDATE qualificacoes_historico',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'INSERT INTO auditoria_avancada_v2',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/tipos', tiposRouter);

    const response = await app.fetch(
      new Request('http://localhost/tipos/10', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: 'AS350 B2',
          codigo: 'AS350-B2',
          categoria: 'MANUTENCAO',
          validade: 24,
          vencimento_fim_mes: 1,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        id: '10',
        validade_anterior: 12,
        validade_nova: 24,
        historicos_recalculados: 2,
        historicos_ignorados: 0,
        warnings: [],
      },
    });

    expect(invalidateMaterializedStatsMock).toHaveBeenCalledWith(db);
    expect(registrarAuditoriaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tabela: 'qualificacoes_tipos',
        acao: 'UPDATE',
        registro_id: '10',
        dados_novos: expect.objectContaining({
          historicos_recalculados: 2,
          historicos_ignorados: 0,
        }),
      }),
    );

    const batchCall = calls.find((call) => call.method === 'batch');
    expect(batchCall?.query).toContain('UPDATE qualificacoes_historico');
    expect(batchCall?.args).toContain(202);
    expect(batchCall?.args).toContain('AS350-B2');
  });

  it('usa formato EAD para manter o curso sincronizado mesmo quando a categoria muda', async () => {
    const { db } = createMockDb([
      [
        "PRAGMA table_info('qualificacoes_tipos')",
        {
          all: () => ({
            results: [
              { name: 'id' },
              { name: 'codigo' },
              { name: 'validade' },
              { name: 'is_check' },
              { name: 'formato_id' },
            ],
          }),
        },
      ],
      [
        "SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2' LIMIT 1",
        {
          first: () => ({ name: 'auditoria_avancada_v2' }),
        },
      ],
      [
        'SELECT id FROM qualificacoes_tipos WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        {
          first: () => ({ id: 10 }),
        },
      ],
      [
        'SELECT id FROM qualificacoes_tipos WHERE UPPER(codigo) = UPPER(?) AND id != ? AND empresa_id = ? AND deleted_at IS NULL LIMIT 1',
        {
          first: () => null,
        },
      ],
      [
        'SELECT qt.empresa_id, qt.codigo, qt.nome, qt.categoria, qt.validade, qt.vencimento_fim_mes, qt.formato_id, qf.codigo AS formato_codigo',
        {
          first: () => ({
            empresa_id: 7,
            categoria: 'EAD',
            formato_id: 2,
            formato_codigo: 'EAD',
            validade: 12,
            codigo: 'EMERG-001',
            nome: 'Emergências Gerais',
            vencimento_fim_mes: 1,
          }),
        },
      ],
      [
        'UPDATE qualificacoes_tipos SET',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        'SELECT id, codigo, nome, categoria, validade, vencimento_fim_mes, carga_horaria, carga_horaria_inicial, carga_horaria_recorrente',
        {
          first: () => ({
            id: 10,
            codigo: 'EMERG-001',
            nome: 'Emergências Gerais',
            categoria: 'TREINAMENTO TEORICO',
            validade: 12,
            vencimento_fim_mes: 1,
            carga_horaria: 8,
            carga_horaria_inicial: 8,
            carga_horaria_recorrente: 8,
          }),
        },
      ],
      [
        'SELECT qh.id,',
        {
          all: () => ({ results: [] }),
        },
      ],
      [
        'INSERT INTO auditoria_avancada_v2',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
    ]);

    const app = new Hono<{ Bindings: Env }>();
    app.route('/tipos', tiposRouter);

    const response = await app.fetch(
      new Request('http://localhost/tipos/10', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nome: 'Emergências Gerais',
          codigo: 'EMERG-001',
          categoria: 'TREINAMENTO TEORICO',
          validade: 12,
          vencimento_fim_mes: 1,
        }),
      }),
      { DB: db } as Env,
      {} as ExecutionContext,
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(syncLmsCourseFromQualificacaoTipo)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(syncLmsCourseFromQualificacaoTipo)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        empresaId: 7,
        qualificacaoTipoId: '10',
      }),
    );
    expect(vi.mocked(softDeleteLmsCourseForQualificacaoTipo)).not.toHaveBeenCalled();
  });
});
