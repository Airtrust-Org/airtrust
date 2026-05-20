import { beforeEach, describe, expect, it, vi } from 'vitest';

const { garantirG1SemPlanejadoMock, isG1QualificacaoCodeMock } = vi.hoisted(() => ({
  garantirG1SemPlanejadoMock: vi.fn(),
  isG1QualificacaoCodeMock: vi.fn(),
}));

vi.mock('../../services/qualificacoes-g1-sem', () => ({
  garantirG1SemPlanejado: garantirG1SemPlanejadoMock,
  isG1QualificacaoCode: isG1QualificacaoCodeMock,
}));

import {
  createQualificacao,
  findFuncionarioByEdappUser,
  resolveEdAppCompletionDate,
} from '../../routes/integracoes-edapp-helpers';

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
        return handler.run ? handler.run(args) : { meta: { last_row_id: 0, changes: 0 } };
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

describe('integracoes-edapp-helpers.createQualificacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    garantirG1SemPlanejadoMock.mockResolvedValue(undefined);
    isG1QualificacaoCodeMock.mockReturnValue(false);
  });

  it('marca qualificacoes anteriores como renovadas ao criar uma nova conclusao EdApp', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 10, validade: 12, vencimento_fim_mes: 1 }),
        },
      ],
      [
        'AND data_conclusao = ?',
        {
          first: () => null,
        },
      ],
      [
        'SET renovada = 1',
        {
          run: () => ({ meta: { changes: 1 } }),
        },
      ],
      [
        `AND date(COALESCE(data_conclusao, '1900-01-01')) > date(?)`,
        {
          first: () => null,
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ meta: { last_row_id: 4206, changes: 1 } }),
        },
      ],
    ]);

    const result = await createQualificacao(
      db,
      41,
      'E1',
      'analytics:manual:E1',
      '2026-04-08T12:34:56.000Z',
    );

    expect(result).toMatchObject({
      success: true,
      qualificacao_id: 4206,
      renovacao: true,
      created: true,
    });

    const renewCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('SET renovada = 1'),
    );
    expect(renewCall?.args).toEqual([
      'Substituída por curso EdApp em 2026-04-08',
      '%Substituída por curso EdApp%',
      'Substituída por curso EdApp em 2026-04-08',
      41,
      null,
      null,
      'E1',
      '2026-04-08',
    ]);

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall?.args[0]).toBe(41);
    expect(insertCall?.args[2]).toBe('E1');
    expect(insertCall?.args[3]).toBe('2026-04-08');
    expect(insertCall?.args[7]).toBe(0);
    expect(insertCall?.args[8]).toBeNull();
  });

  it('marca a nova qualificacao como renovada quando o historico chega fora de ordem', async () => {
    const { db, calls } = createMockDb([
      [
        'FROM qualificacoes_tipos',
        {
          first: () => ({ id: 10, validade: 12, vencimento_fim_mes: 1 }),
        },
      ],
      [
        'AND data_conclusao = ?',
        {
          first: () => null,
        },
      ],
      [
        'SET renovada = 1',
        {
          run: () => ({ meta: { changes: 0 } }),
        },
      ],
      [
        `AND date(COALESCE(data_conclusao, '1900-01-01')) > date(?)`,
        {
          first: () => ({ id: 5001, data_conclusao: '2026-04-10' }),
        },
      ],
      [
        'INSERT INTO qualificacoes_historico',
        {
          run: () => ({ meta: { last_row_id: 4207, changes: 1 } }),
        },
      ],
    ]);

    const result = await createQualificacao(
      db,
      41,
      'E1',
      'analytics:manual:E1',
      '2026-04-08T23:15:00-03:00',
    );

    expect(result).toMatchObject({
      success: true,
      qualificacao_id: 4207,
      renovacao: true,
      created: true,
      message: 'Qualificação histórica criada como renovada (validade: 12 meses)',
    });

    const insertCall = calls.find(
      (call) => call.method === 'run' && call.query.includes('INSERT INTO qualificacoes_historico'),
    );
    expect(insertCall?.args[3]).toBe('2026-04-08');
    expect(insertCall?.args[6]).toBe(
      'EdApp: analytics:manual:E1 | Válido por 12 meses | Conclusão: 2026-04-08 | Substituída por curso EdApp em 2026-04-10',
    );
    expect(insertCall?.args[7]).toBe(1);
    expect(insertCall?.args[8]).toBe('RENOVADA');
  });
});

describe('integracoes-edapp-helpers.resolveEdAppCompletionDate', () => {
  it('preserva a data civil do timestamp do EdApp mesmo com fuso horario', () => {
    expect(resolveEdAppCompletionDate('2026-04-08T23:15:00-03:00')).toBe('2026-04-08');
  });
});

describe('integracoes-edapp-helpers.findFuncionarioByEdappUser', () => {
  it('faz fallback por nome aproximado ignorando acentos e nomes intermediarios', async () => {
    const { db } = createMockDb([
      [
        'FROM integracoes_edapp_usuarios u',
        {
          first: () => null,
        },
      ],
      [
        'FROM funcionarios f',
        {
          all: () => ({
            results: [
              {
                funcionario_id: 3,
                funcionario_nome: 'Antonio Luiz Simões Ramos',
                funcionario_email: 'antonio.ramos@voecostadosol.com.br',
                matricula: '00074',
                codigo_anac: '123456',
                guerra: 'Ramos',
                edapp_user_id: '671f8c111d09157bff5f4840',
                edapp_email: 'antonio.ramos@voecostadosol.com.br',
                edapp_username: 'Antonio Ramos',
              },
            ],
          }),
        },
      ],
    ]);

    const result = await findFuncionarioByEdappUser(db, {
      edappUserId: null,
      userExternalId: 'Antônio Ramos',
    });

    expect(result).toMatchObject({
      funcionario_id: 3,
      funcionario_nome: 'Antonio Luiz Simões Ramos',
      matched_by: 'edapp_username',
    });
  });

  it('faz fallback por email do funcionario quando nao existe mapeamento explicito', async () => {
    const { db } = createMockDb([
      [
        'FROM integracoes_edapp_usuarios u',
        {
          first: () => null,
        },
      ],
      [
        'FROM funcionarios f',
        {
          all: () => ({
            results: [
              {
                funcionario_id: 32,
                funcionario_nome: 'Vitor De Almeida Costa',
                funcionario_email: 'vitor.costa@voecostadosol.com.br',
                matricula: '00221',
                codigo_anac: '654321',
                guerra: 'Vitor Costa',
                edapp_user_id: null,
                edapp_email: null,
                edapp_username: null,
              },
            ],
          }),
        },
      ],
    ]);

    const result = await findFuncionarioByEdappUser(db, {
      edappUserId: null,
      edappEmail: 'VITOR.COSTA@VOECOSTADOSOL.COM.BR',
    });

    expect(result).toMatchObject({
      funcionario_id: 32,
      funcionario_nome: 'Vitor De Almeida Costa',
      matched_by: 'funcionario_email',
    });
  });
});
