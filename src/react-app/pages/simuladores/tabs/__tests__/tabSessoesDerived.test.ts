import { describe, expect, it } from 'vitest';
import type { Sessao } from '@/react-app/components/simuladores/SessaoCard';
import {
  computeSessaoStats,
  filterAndSortSessoes,
  getLocalDateKey,
  getProximasSessoes,
  getSessoesRecentes,
} from '../tabSessoesDerived';

function buildSessao(
  id: number,
  data: string,
  status: Sessao['status'],
  overrides: Partial<Sessao> = {},
): Sessao {
  return {
    id,
    uuid: `sessao-${id}`,
    simulador_id: 1,
    simulador_nome: 'Simulador Teste',
    simulador_modelo: 'MODELO-TESTE',
    data,
    horario_inicio: '08:00',
    horario_fim: '09:00',
    duracao_minutos: 60,
    instrutor_id: 10,
    instrutor_nome: 'Instrutor Teste',
    tipo_sessao: 'Treinamento',
    status,
    participantes: [],
    fichas: [],
    ...overrides,
  };
}

describe('tabSessoesDerived', () => {
  it('calcula estatísticas em uma única derivação', () => {
    const sessoes = [
      buildSessao(1, '2026-08-01', 'AGENDADO'),
      buildSessao(2, '2026-08-02', 'EM_ANDAMENTO'),
      buildSessao(3, '2026-08-03', 'CONCLUIDO'),
      buildSessao(4, '2026-08-04', 'CANCELADO'),
    ];

    expect(computeSessaoStats(sessoes)).toEqual({
      total: 4,
      agendadas: 1,
      emAndamento: 1,
      concluidas: 1,
      canceladas: 1,
    });
  });

  it('normaliza a busca uma vez e ordena por data decrescente', () => {
    const sessoes = [
      buildSessao(1, '2026-08-01', 'AGENDADO', { instrutor_nome: 'Ana Silva' }),
      buildSessao(2, '2026-08-03', 'AGENDADO', { simulador_nome: 'Helicóptero Alfa' }),
      buildSessao(3, '2026-08-02', 'CONCLUIDO', { tipo_sessao: 'Cheque Ana' }),
    ];

    expect(filterAndSortSessoes(sessoes, '', ' ANA ').map((sessao) => sessao.id)).toEqual([
      3, 1,
    ]);
    expect(filterAndSortSessoes(sessoes, 'AGENDADO', '').map((sessao) => sessao.id)).toEqual([
      2, 1,
    ]);
  });

  it('mantém próximas sessões em ordem crescente e recentes em ordem decrescente', () => {
    const sessoes = filterAndSortSessoes(
      [
        buildSessao(1, '2026-08-01', 'AGENDADO'),
        buildSessao(2, '2026-08-02', 'CONCLUIDO'),
        buildSessao(3, '2026-08-03', 'AGENDADO'),
        buildSessao(4, '2026-08-05', 'AGENDADO'),
      ],
      '',
      '',
    );

    expect(getProximasSessoes(sessoes, '2026-08-02').map((sessao) => sessao.id)).toEqual([
      3, 4,
    ]);
    expect(getSessoesRecentes(sessoes, '2026-08-02').map((sessao) => sessao.id)).toEqual([
      2, 1,
    ]);
  });

  it('não altera a lista original', () => {
    const sessoes = [
      buildSessao(1, '2026-08-01', 'AGENDADO'),
      buildSessao(2, '2026-08-03', 'AGENDADO'),
    ];
    const originalIds = sessoes.map((sessao) => sessao.id);

    const filtradas = filterAndSortSessoes(sessoes, '', '');
    getProximasSessoes(filtradas, '2026-08-01');

    expect(sessoes.map((sessao) => sessao.id)).toEqual(originalIds);
  });

  it('gera a chave local sem conversão UTC', () => {
    expect(getLocalDateKey(new Date(2026, 7, 2, 23, 59))).toBe('2026-08-02');
  });
});
