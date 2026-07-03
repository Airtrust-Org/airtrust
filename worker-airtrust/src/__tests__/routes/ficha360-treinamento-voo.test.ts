import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock('../../services/employee-sector-access', () => ({
  assertFuncionarioInScope: vi.fn(async () => undefined),
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all', setorIds: [], funcionarioId: null })),
}));

import { getFicha360 } from '../../routes/ficha360';

type QueryResult = { results?: unknown[]; first?: unknown };

function createMockDb(options?: { includeOperationalRenewedQualification?: boolean }) {
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
    sessoes_participantes: ['sessao_id', 'funcionario_id', 'papel', 'deleted_at'],
    simulador_agendamentos: [
      'id',
      'data',
      'nome',
      'tipo_sessao',
      'tipo_dispositivo',
      'simulador_id',
      'aeronave_id',
      'deleted_at',
    ],
    fichas_sessao: [
      'id',
      'empresa_id',
      'agendamento_slot_id',
      'colaborador_id_aluno',
      'instrutor_id',
      'tipo_sessao',
      'tipo_aeronave',
      'nota_final',
      'resultado_final',
      'status',
      'observacoes',
      'data_sessao',
      'aprovado',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
    fichas_sessao_manobras: [
      'id',
      'ficha_id',
      'codigo',
      'nome',
      'descricao',
      'ordem',
      'resultado',
      'observacoes',
      'deleted_at',
    ],
    simuladores: ['id', 'nome', 'deleted_at'],
    aeronaves: ['id', 'prefixo', 'modelo', 'deleted_at'],
    modelos_sessao: ['id', 'codigo', 'nome', 'deleted_at'],
    manobras: ['id', 'empresa_id', 'codigo', 'nome', 'descricao', 'deleted_at'],
    auditoria_avancada_v2: [],
    auditoria: [],
  };

  const prepare = vi.fn((query: string) => {
    const normalized = query.replace(/\s+/g, ' ').trim();

    const exec = async (args: unknown[], method: 'all' | 'first') => {
      if (normalized.startsWith("PRAGMA table_info('")) {
        const tableName = normalized.slice(19, -2);
        const cols = tableColumns[tableName] || [];
        return method === 'all'
          ? { results: cols.map((name) => ({ name })) }
          : null;
      }

      if (normalized.includes('SELECT * FROM funcionarios WHERE id = ?')) {
        return {
          id: 42,
          empresa_id: 1,
          nome: 'Joao Teste',
          nome_completo: 'Joao Teste',
          matricula: 'JT-42',
          funcao: 'Piloto',
          deleted_at: null,
        };
      }

      if (normalized.includes('WITH qualificacoes_ativas AS')) {
        if (options?.includeOperationalRenewedQualification) {
          if (
            normalized.includes("NOT IN ('CANCELADA', 'RENOVADA')") ||
            normalized.includes('COALESCE(q.renovada, 0) = 0')
          ) {
            return { results: [] };
          }

          return {
            results: [
              {
                id: 7001,
                funcionario_id: 42,
                tipo_id: 55,
                data_realizacao: '2026-06-01',
                data_vencimento: '2099-12-31',
                observacoes: 'vigente',
                created_at: '2026-06-01T00:00:00Z',
                updated_at: '2026-06-01T00:00:00Z',
                categoria: 'MANUTENCAO',
                nome: 'NR-12',
                codigo: 'NR-12',
                origem_tipo: null,
                lms_matricula_id: null,
              },
            ],
          };
        }
        return { results: [] };
      }

      if (normalized.includes('FROM qualificacoes_historico q')) {
        if (options?.includeOperationalRenewedQualification) {
          return {
            results: [
              {
                id: 7001,
                funcionario_id: 42,
                tipo_id: 55,
                data_realizacao: '2026-06-01',
                data_vencimento: '2099-12-31',
                observacoes: 'vigente',
                created_at: '2026-06-01T00:00:00Z',
                updated_at: '2026-06-01T00:00:00Z',
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
        return { results: [] };
      }

      if (normalized.includes('FROM lms_matriculas m')) {
        return { results: [] };
      }

      if (normalized.includes('FROM treinamentos_participantes tp')) {
        return { results: [] };
      }

      if (
        normalized.includes('FROM sessoes_participantes p JOIN simulador_agendamentos s') ||
        normalized.includes('FROM sessoes_participantes p JOIN sessoes s')
      ) {
        return { results: [] };
      }

      if (
        normalized.includes('FROM fichas_sessao WHERE colaborador_id_aluno = ?') &&
        normalized.includes('LIMIT 20')
      ) {
        return { results: [] };
      }

      if (normalized.includes('FROM fichas_sessao fs LEFT JOIN simulador_agendamentos sa')) {
        return {
          results: [
            {
              ficha_id: 100,
              sessao_id: 500,
              data_sessao: '2026-06-10',
              tipo_sessao_codigo: 'LOFT',
              tipo_dispositivo: 'FTD',
              simulador_id: 4,
              aeronave_id: null,
              recurso_nome: 'SIM-AW139',
              modelo_sessao: 'LOFT AW139',
              instrutor_nome: 'Instrutor A',
              nota_geral: 7.5,
              status: 'CONCLUIDA',
              resultado_final: 'REPROVADO',
              aprovado: 0,
              observacoes_sessao: 'Reforcar briefing.',
            },
            {
              ficha_id: 101,
              sessao_id: 501,
              data_sessao: '2026-06-12',
              tipo_sessao_codigo: 'LINE',
              tipo_dispositivo: 'AERONAVE',
              simulador_id: null,
              aeronave_id: 9,
              recurso_nome: 'PS-ABC',
              modelo_sessao: 'Line Flight',
              instrutor_nome: 'Instrutor B',
              nota_geral: 8.4,
              status: 'CONCLUIDA',
              resultado_final: 'APROVADO',
              aprovado: 1,
              observacoes_sessao: null,
            },
          ],
        };
      }

      if (normalized.includes('FROM fichas_sessao_manobras fsm INNER JOIN fichas_sessao fs')) {
        return {
          results: [
            {
              id: 9001,
              ficha_id: 100,
              ordem: 1,
              codigo: 'M-01',
              nome_ficha: 'Arremetida',
              descricao_ficha: 'Arremetida',
              nome_catalogo: 'Arremetida',
              descricao_catalogo: 'Arremetida',
              resultado: '6.0',
              observacoes: 'Houve desvio na potência.',
            },
            {
              id: 9002,
              ficha_id: 100,
              ordem: 2,
              codigo: 'M-02',
              nome_ficha: 'Pane parcial',
              descricao_ficha: 'Pane parcial',
              nome_catalogo: 'Pane parcial',
              descricao_catalogo: 'Pane parcial',
              resultado: '9',
              observacoes: null,
            },
            {
              id: 9003,
              ficha_id: 101,
              ordem: 3,
              codigo: 'M-03',
              nome_ficha: 'Curva base',
              descricao_ficha: 'Curva base',
              nome_catalogo: 'Curva base',
              descricao_catalogo: 'Curva base',
              resultado: '7',
              observacoes: 'Ajustar coordenação.',
            },
          ],
        };
      }

      if (normalized.includes('FROM auditoria_avancada_v2')) {
        return { results: [] };
      }

      if (normalized.includes('FROM auditoria ')) {
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

  return {
    prepare,
  } as unknown as D1Database;
}

describe('ficha360 treinamento de voo pontos de atencao', () => {
  it('agrupa sessoes e manobras abaixo do threshold na resposta da ficha 360', async () => {
    const db = createMockDb();

    const data = await getFicha360(db, 42, 1);

    expect(data).not.toBeNull();
    expect(data?.treinamento_voo_pontos_atencao).toMatchObject({
      threshold: 8,
      total_itens: 3,
      total_sessoes: 2,
      ultima_ocorrencia: '2026-06-12',
    });

    expect(data?.treinamento_voo_pontos_atencao?.sessoes).toHaveLength(2);
    expect(data?.treinamento_voo_pontos_atencao?.sessoes[0]).toMatchObject({
      ficha_id: 101,
      tipo_sessao: 'AERONAVE',
      recurso_nome: 'PS-ABC',
      url_ficha: '/simuladores/fichas/101',
    });
    expect(data?.treinamento_voo_pontos_atencao?.sessoes[0].itens_abaixo_padrao).toEqual([
      expect.objectContaining({
        nome: 'Curva base',
        tipo: 'MANOBRA',
        nota: 7,
      }),
    ]);

    expect(data?.treinamento_voo_pontos_atencao?.sessoes[1]).toMatchObject({
      ficha_id: 100,
      tipo_sessao: 'SIMULADOR',
      recurso_nome: 'SIM-AW139',
    });
    expect(data?.treinamento_voo_pontos_atencao?.sessoes[1].itens_abaixo_padrao).toEqual([
      expect.objectContaining({
        nome: 'Nota geral da sessão',
        tipo: 'SESSAO',
        nota: 7.5,
        observacao: 'Reforcar briefing.',
      }),
      expect.objectContaining({
        nome: 'Arremetida',
        tipo: 'MANOBRA',
        nota: 6,
        observacao: 'Houve desvio na potência.',
      }),
    ]);
  });

  it('mantem a qualificacao vigente na ficha 360 mesmo quando o ultimo registro veio marcado como renovada', async () => {
    const db = createMockDb({ includeOperationalRenewedQualification: true });

    const data = await getFicha360(db, 42, 1);

    expect(data).not.toBeNull();
    expect(data?.qualificacoes).toEqual([
      expect.objectContaining({
        codigo: 'NR-12',
        data_vencimento: '2099-12-31',
      }),
    ]);
    expect(data?.qualificacoes_historico).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          codigo: 'NR-12',
          renovada: 1,
          status: 'RENOVADA',
        }),
      ]),
    );
  });
});
