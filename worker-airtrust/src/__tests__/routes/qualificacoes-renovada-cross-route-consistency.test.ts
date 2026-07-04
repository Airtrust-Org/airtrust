import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';

/**
 * Golden regression pack: garante que Compliance, Ficha 360 e Matriz de
 * Treinamento concordam para o MESMO funcionário/requisito no cenário que
 * já causou incidente em produção: única qualificação persistida como
 * RENOVADA/renovada=1, sem sucessor, ainda operacionalmente vigente
 * (data_vencimento futura). Nenhuma das três rotas pode reportar gap.
 *
 * Cada rota tem um mock de D1 próprio porque o shape das queries difere
 * (compliance/ficha360 elegem por código textual; matriz-treinamento elege
 * por qualificacao_tipo_id), mas todas descrevem o mesmo funcionário 42 /
 * empresa 6 / requisito NR-12 / vencimento 2099-12-31 / status RENOVADA.
 */

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

vi.mock('../../services/employee-sector-access', () => ({
  appendEmployeeSectorFilter: vi.fn(),
  assertFuncionarioInScope: vi.fn(async () => undefined),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

function createComplianceMockDb() {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return {
          results: [
            { name: 'funcionario_id' },
            { name: 'tipo_qualificacao_id' },
            { name: 'data_realizacao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.startsWith("PRAGMA table_info('licencas')")) {
        return { results: [] };
      }

      if (normalized.includes('FROM funcionarios WHERE deleted_at IS NULL AND ativo = 1')) {
        return {
          success: true,
          results: [
            {
              id: 42,
              nome: 'Tecnico Manutencao',
              matricula: 'TM-42',
              funcao: 'Tecnico de Manutencao',
            },
          ],
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        return {
          results: [
            {
              funcionario_id: 42,
              codigo: 'NR-12',
              data_vencimento: '2099-12-31',
            },
          ],
        };
      }

      if (normalized.includes('FROM requisitos_compliance')) {
        return {
          results: [
            {
              id: 1,
              funcao: 'Tecnico de Manutencao',
              tipo_recurso: 'qualificacao',
              referencia: 'NR-12',
              descricao: 'Qualificacao obrigatoria NR-12',
            },
          ],
        };
      }

      if (normalized.includes('FROM lms_matriculas')) {
        return { results: [] };
      }

      return method === 'all' ? { results: [] } : null;
    };

    return {
      all: async () => exec([], 'all'),
      first: async () => exec([], 'first'),
      bind: (...args: unknown[]) => ({
        all: async () => exec(args, 'all'),
        first: async () => exec(args, 'first'),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

function createFicha360MockDb() {
  const tableColumns: Record<string, string[]> = {
    funcionarios: ['id', 'empresa_id', 'nome', 'nome_completo', 'matricula', 'funcao', 'deleted_at'],
    qualificacoes_historico: [
      'id',
      'funcionario_id',
      'tipo_qualificacao_id',
      'data_realizacao',
      'data_vencimento',
      'status',
      'renovada',
      'deleted_at',
    ],
    licencas: [],
    requisitos_compliance: [],
  };

  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('")) {
        const tableName = normalized.slice(19, -2);
        const cols = tableColumns[tableName] || [];
        return method === 'all' ? { results: cols.map((name) => ({ name })) } : null;
      }

      if (normalized.includes('SELECT * FROM funcionarios WHERE id = ?')) {
        return {
          id: 42,
          empresa_id: 6,
          nome: 'Tecnico Manutencao',
          nome_completo: 'Tecnico Manutencao',
          matricula: 'TM-42',
          funcao: 'Tecnico de Manutencao',
          deleted_at: null,
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        return {
          results: [
            {
              id: 7001,
              funcionario_id: 42,
              tipo_id: 10,
              data_realizacao: '2024-01-10',
              data_vencimento: '2099-12-31',
              categoria: 'MANUTENCAO',
              nome: 'NR-12',
              codigo: 'NR-12',
              origem_tipo: null,
              lms_matricula_id: null,
            },
          ],
        };
      }

      if (normalized.includes('FROM qualificacoes_historico q')) {
        return {
          results: [
            {
              id: 7001,
              funcionario_id: 42,
              tipo_id: 10,
              data_realizacao: '2024-01-10',
              data_vencimento: '2099-12-31',
              origem_tipo: null,
              lms_matricula_id: null,
              status: 'RENOVADA',
              renovada: 1,
              categoria: 'MANUTENCAO',
              nome: 'NR-12',
              codigo: 'NR-12',
            },
          ],
        };
      }

      if (normalized.includes('FROM lms_matriculas m')) {
        return { results: [] };
      }

      if (normalized.includes('FROM treinamentos_participantes tp')) {
        return { results: [] };
      }

      return method === 'all' ? { results: [] } : null;
    };

    return {
      all: async () => exec([], 'all'),
      first: async () => exec([], 'first'),
      bind: (...args: unknown[]) => ({
        all: async () => exec(args, 'all'),
        first: async () => exec(args, 'first'),
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

function createMatrizMockDb() {
  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (_args: unknown[]) => {
      if (normalized.startsWith("PRAGMA table_info('funcionarios')")) {
        return {
          results: [
            { name: 'id' },
            { name: 'nome' },
            { name: 'funcao_id' },
            { name: 'funcao' },
            { name: 'empresa_id' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.startsWith("PRAGMA table_info('qualificacoes_historico')")) {
        return {
          results: [
            { name: 'funcionario_id' },
            { name: 'tipo_qualificacao_id' },
            { name: 'data_realizacao' },
            { name: 'data_vencimento' },
            { name: 'status' },
            { name: 'renovada' },
            { name: 'empresa_id' },
            { name: 'updated_at' },
            { name: 'created_at' },
            { name: 'deleted_at' },
          ],
        };
      }

      if (normalized.includes('FROM funcionarios') && normalized.includes('WHERE id = ?')) {
        return { id: 42, nome: 'Tecnico Manutencao', funcao_id: 5, funcao: null };
      }

      if (
        normalized.includes('FROM matriz_treinamento_funcao m') &&
        normalized.includes('LEFT JOIN qualificacoes_tipos')
      ) {
        return {
          results: [
            {
              matriz_id: 1,
              qualificacao_tipo_id: 10,
              qualificacao_tipo_nome: 'NR-12',
              qualificacao_tipo_codigo: 'NR-12',
              validade_meses: 12,
              obrigatoriedade: 'OBRIGATORIA',
              critico_operacional: 1,
              origem: 'MATRIZ',
              observacoes: null,
            },
          ],
        };
      }

      if (normalized.includes('WITH historico_ativo AS')) {
        return {
          results: [
            {
              tipo_id: 10,
              ultima_data: '2024-01-10',
              data_vencimento: '2099-12-31',
            },
          ],
        };
      }

      if (normalized.includes('FROM funcoes')) {
        return { nome: 'Tecnico de Manutencao' };
      }

      return { results: [] };
    };

    return {
      all: async () => exec([]),
      first: async () => exec([]),
      bind: (...args: unknown[]) => ({
        all: async () => {
          const r = await exec(args);
          return 'results' in r ? r : { results: [] };
        },
        first: async () => {
          const r = await exec(args);
          return 'results' in r ? null : r;
        },
      }),
    };
  });

  return { prepare } as unknown as D1Database;
}

describe('consistencia cross-rota: RENOVADA vigente sem sucessor', () => {
  it('compliance considera o funcionario conforme', async () => {
    const complianceRouter = (await import('../../routes/compliance')).default;
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', complianceRouter);

    const response = await app.request(
      '/compliance/funcionarios',
      undefined,
      { DB: createComplianceMockDb() } as Env,
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ status: string; nome_completo: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ nome_completo: 'Tecnico Manutencao', status: 'conforme' }),
    ]);
  });

  it('ficha 360 mantem a qualificacao como vigente', async () => {
    const { getFicha360 } = await import('../../routes/ficha360');
    const data = await getFicha360(createFicha360MockDb(), 42, 6);

    expect(data).not.toBeNull();
    expect(data?.qualificacoes).toEqual([
      expect.objectContaining({ codigo: 'NR-12', data_vencimento: '2099-12-31' }),
    ]);
  });

  it('matriz de treinamento nao aponta gap (EM_DIA, nao EM_FALTA)', async () => {
    const matrizRouter = (await import('../../routes/matriz-treinamento')).default;
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', matrizRouter);

    const response = await app.request(
      '/requisitos/42',
      undefined,
      { DB: createMatrizMockDb() } as Env,
    );
    const body = (await response.json()) as {
      success: boolean;
      data: Array<{ qualificacao_tipo_id: number; status: string }>;
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({ qualificacao_tipo_id: 10, status: 'EM_DIA' }),
    ]);
  });
});
