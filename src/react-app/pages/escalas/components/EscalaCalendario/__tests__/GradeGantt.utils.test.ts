import { describe, expect, it } from 'vitest';

import {
  buildTripulantesSemAeronaveRows,
  collectFuncionariosComAeronaveAtiva,
} from '../GradeGantt';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
  QuinzenaEscala,
} from '../../../hooks/queries/useEscalasQuery';

function createAlocacao(partial: Partial<EscalaAlocacao>): EscalaAlocacao {
  return {
    id: partial.id || 'aloc-1',
    escala_id: partial.escala_id || 'escala-1',
    funcao: partial.funcao ?? 'PIC',
    situacao_tipo: partial.situacao_tipo,
    situacao_cor: partial.situacao_cor ?? null,
    situacao_nome: partial.situacao_nome ?? null,
    situacao_icone: partial.situacao_icone ?? null,
    situacao_bloqueia_alocacao: partial.situacao_bloqueia_alocacao ?? null,
    quinzena_id: partial.quinzena_id ?? null,
    data_inicio: partial.data_inicio || '2026-05-01',
    data_fim: partial.data_fim || '2026-05-15',
    padrao_escala_id: partial.padrao_escala_id ?? null,
    base: partial.base ?? null,
    observacoes: partial.observacoes ?? null,
    status: partial.status || 'planejado',
    auto_gerado: partial.auto_gerado ?? 0,
    created_by: partial.created_by ?? null,
    created_at: partial.created_at || '2026-04-11T00:00:00.000Z',
    updated_at: partial.updated_at || '2026-04-11T00:00:00.000Z',
    funcionario: partial.funcionario || {
      id: partial.funcionario_id || 'func-1',
      nome: partial.funcionario_nome || 'Tripulante',
      nome_guerra: null,
      matricula: null,
      role: partial.funcionario_role || 'PIC',
    },
    aeronave: partial.aeronave || {
      id: partial.aeronave_id ?? null,
      prefixo: partial.aeronave_prefixo ?? null,
      modelo: partial.aeronave_modelo ?? null,
    },
    funcionario_id: partial.funcionario_id || 'func-1',
    funcionario_nome: partial.funcionario_nome || 'Tripulante',
    funcionario_guerra: partial.funcionario_guerra ?? null,
    funcionario_matricula: partial.funcionario_matricula ?? null,
    funcionario_role: partial.funcionario_role ?? 'PIC',
    funcionario_quinzena: partial.funcionario_quinzena ?? null,
    funcionario_is_instrutor: partial.funcionario_is_instrutor ?? false,
    aeronave_id: partial.aeronave_id ?? null,
    aeronave_prefixo: partial.aeronave_prefixo ?? null,
    aeronave_modelo: partial.aeronave_modelo ?? null,
    modelo_aeronave: partial.modelo_aeronave ?? partial.aeronave_modelo ?? null,
    funcionario_modelo_aeronave: partial.funcionario_modelo_aeronave ?? null,
  };
}

function createCoberturaTripulante(
  partial: Partial<EscalaCoberturaTripulante>,
): EscalaCoberturaTripulante {
  return {
    id: partial.id || 'func-1',
    nome: partial.nome || 'Tripulante',
    nome_guerra: partial.nome_guerra ?? null,
    matricula: partial.matricula ?? null,
    cargo: partial.cargo || 'comandante',
    quinzena_numero: partial.quinzena_numero ?? 1,
    alocacao_q1: partial.alocacao_q1 ?? null,
    alocacao_q2: partial.alocacao_q2 ?? null,
    status_q1: partial.status_q1 || 'livre',
    status_q2: partial.status_q2 || 'livre',
    status_geral: partial.status_geral || 'livre',
    modelos_habilitados: partial.modelos_habilitados ?? [],
  };
}

const QUINZENAS_MES: QuinzenaEscala[] = [
  {
    id: 1,
    numero: 1,
    data_inicio: '2026-05-01',
    data_fim: '2026-05-16',
    mes: 5,
    ano: 2026,
  },
  {
    id: 2,
    numero: 2,
    data_inicio: '2026-05-17',
    data_fim: '2026-05-31',
    mes: 5,
    ano: 2026,
  },
];

describe('collectFuncionariosComAeronaveAtiva', () => {
  it('marca funcionarios com alocacao operacional em aeronave no periodo visivel', () => {
    const resultado = collectFuncionariosComAeronaveAtiva(
      [
        createAlocacao({
          funcionario_id: 'ramon',
          funcionario_nome: 'Ramon',
          aeronave_id: 10,
          aeronave_prefixo: 'PS-CDV',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'ramon',
          funcionario_nome: 'Ramon',
          situacao_tipo: 'STB',
          aeronave_id: null,
          aeronave_prefixo: null,
          funcao: null,
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
      ],
      '2026-05-01',
      '2026-05-31',
    );

    expect(resultado.has('ramon')).toBe(true);
  });

  it('ignora situacoes sem aeronave e alocacoes fora do periodo visivel', () => {
    const resultado = collectFuncionariosComAeronaveAtiva(
      [
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'adriana',
          funcionario_nome: 'Adriana',
          situacao_tipo: 'STB',
          aeronave_id: null,
          aeronave_prefixo: null,
          funcao: null,
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
        }),
        createAlocacao({
          id: 'aloc-fora',
          funcionario_id: 'caio',
          funcionario_nome: 'Caio',
          aeronave_id: 11,
          aeronave_prefixo: 'PS-CDU',
          data_inicio: '2026-06-01',
          data_fim: '2026-06-15',
        }),
      ],
      '2026-05-01',
      '2026-05-31',
    );

    expect(resultado.size).toBe(0);
  });
});

describe('buildTripulantesSemAeronaveRows', () => {
  it('inclui tripulantes sem aeronave mesmo sem situacao registrada', () => {
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: [],
      tripulantesCobertura: [
        createCoberturaTripulante({
          id: 'castro',
          nome: 'Carlos Castro',
          nome_guerra: 'Castro',
          cargo: 'comandante',
          quinzena_numero: 2,
          modelos_habilitados: ['S76'],
        }),
      ],
      funcionariosComAeronaveAtiva: new Set(),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-05-01',
      intervaloVisivelFim: '2026-05-31',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      funcionarioId: 'castro',
      nome: 'Carlos Castro',
      nomeGuerra: 'Castro',
      funcao: 'PIC',
      modelo: 'S76',
      quinzenaPreferencial: 2,
    });
    expect(rows[0].situacoes).toHaveLength(0);
    expect(rows[0].situacoesVisiveis).toHaveLength(0);
    expect(rows[0].situacaoReferencia).toBeNull();
  });

  it('mescla cobertura com situacoes e exclui quem ja esta em aeronave no periodo', () => {
    const rows = buildTripulantesSemAeronaveRows({
      situacoes: [
        createAlocacao({
          id: 'sit-1',
          funcionario_id: 'castro',
          funcionario_nome: 'Carlos Castro',
          funcionario_guerra: 'Castro',
          funcionario_role: 'PIC',
          situacao_tipo: 'FERIAS',
          situacao_nome: 'Férias',
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
        }),
      ],
      tripulantesCobertura: [
        createCoberturaTripulante({
          id: 'castro',
          nome: 'Carlos Castro',
          nome_guerra: 'Castro',
          cargo: 'comandante',
          quinzena_numero: 2,
          modelos_habilitados: ['S76'],
        }),
        createCoberturaTripulante({
          id: 'ramon',
          nome: 'Ramon',
          cargo: 'copiloto',
          quinzena_numero: 1,
          modelos_habilitados: ['AW139'],
        }),
      ],
      funcionariosComAeronaveAtiva: new Set(['ramon']),
      filtroNomeNormalizado: '',
      filtroModeloNormalizado: '',
      quinzenasMes: QUINZENAS_MES,
      intervaloVisivelInicio: '2026-05-01',
      intervaloVisivelFim: '2026-05-31',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].funcionarioId).toBe('castro');
    expect(rows[0].situacaoReferencia?.id).toBe('sit-1');
    expect(rows[0].situacoesVisiveis).toHaveLength(1);
  });
});
