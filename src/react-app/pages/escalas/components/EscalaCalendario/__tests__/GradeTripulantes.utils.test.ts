import { describe, expect, it } from 'vitest';

import {
  buildTripulanteAlocacoesMap,
  chooseTripulanteDayAlocacao,
  isOppositeTripulanteQuinzenaDay,
} from '../GradeTripulantes.utils';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
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

describe('chooseTripulanteDayAlocacao', () => {
  it('prioriza alocacao operacional sobre standby no mesmo dia', () => {
    const resultado = chooseTripulanteDayAlocacao(
      [
        createAlocacao({
          id: 'standby',
          funcionario_id: 'adriana',
          situacao_tipo: 'STB',
          situacao_nome: 'Standby s/ Aeronave',
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
          updated_at: '2026-04-11T00:00:00.000Z',
        }),
        createAlocacao({
          id: 'operacional',
          funcionario_id: 'adriana',
          aeronave_id: 24,
          aeronave_prefixo: 'PS-CDU',
          funcao: 'SIC',
          data_inicio: '2026-05-17',
          data_fim: '2026-05-31',
          updated_at: '2026-04-12T00:00:00.000Z',
        }),
      ],
      '2026-05-17',
    );

    expect(resultado?.id).toBe('operacional');
  });

  it('prioriza situacao critica sobre folga e alocacao operacional no mesmo dia', () => {
    const resultado = chooseTripulanteDayAlocacao(
      [
        createAlocacao({
          id: 'operacional',
          funcionario_id: 'castro',
          aeronave_id: 10,
          aeronave_prefixo: 'PS-CDV',
          data_inicio: '2026-05-10',
          data_fim: '2026-05-12',
        }),
        createAlocacao({
          id: 'folga',
          funcionario_id: 'castro',
          situacao_tipo: 'FOLGA',
          situacao_nome: 'Folga',
          data_inicio: '2026-05-11',
          data_fim: '2026-05-11',
        }),
        createAlocacao({
          id: 'ferias',
          funcionario_id: 'castro',
          situacao_tipo: 'FERIAS',
          situacao_nome: 'Férias',
          data_inicio: '2026-05-11',
          data_fim: '2026-05-20',
        }),
      ],
      '2026-05-11',
    );

    expect(resultado?.id).toBe('ferias');
  });

  it('prefere alocacao manual quando a prioridade visual empata', () => {
    const resultado = chooseTripulanteDayAlocacao(
      [
        createAlocacao({
          id: 'auto',
          funcionario_id: 'ramon',
          situacao_tipo: 'STB',
          auto_gerado: 1,
          updated_at: '2026-04-11T00:00:00.000Z',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
        createAlocacao({
          id: 'manual',
          funcionario_id: 'ramon',
          situacao_tipo: 'STB',
          auto_gerado: 0,
          updated_at: '2026-04-10T00:00:00.000Z',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
      ],
      '2026-05-05',
    );

    expect(resultado?.id).toBe('manual');
  });

  it('retorna null quando nao existe evento ativo para o dia', () => {
    const resultado = chooseTripulanteDayAlocacao(
      [
        createAlocacao({
          id: 'fora-do-dia',
          funcionario_id: 'ramon',
          situacao_tipo: 'STB',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-03',
        }),
      ],
      '2026-05-10',
    );

    expect(resultado).toBeNull();
  });
});

describe('buildTripulanteAlocacoesMap', () => {
  it('mantem apenas tripulantes da cobertura com alocacoes no intervalo visivel', () => {
    const mapa = buildTripulanteAlocacoesMap({
      tripulantes: [
        createCoberturaTripulante({ id: 'castro', nome: 'Castro' }),
        createCoberturaTripulante({ id: 'ramon', nome: 'Ramon' }),
      ],
      alocacoes: [
        createAlocacao({
          id: 'castro-q1',
          funcionario_id: 'castro',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
        createAlocacao({
          id: 'ramon-fora',
          funcionario_id: 'ramon',
          data_inicio: '2026-06-01',
          data_fim: '2026-06-15',
        }),
        createAlocacao({
          id: 'fora-cobertura',
          funcionario_id: 'outro',
          data_inicio: '2026-05-01',
          data_fim: '2026-05-15',
        }),
      ],
      intervaloInicio: '2026-05-01',
      intervaloFim: '2026-05-31',
    });

    expect(mapa.get('castro')?.map((item) => item.id)).toEqual(['castro-q1']);
    expect(mapa.has('ramon')).toBe(false);
    expect(mapa.has('outro')).toBe(false);
  });
});

describe('isOppositeTripulanteQuinzenaDay', () => {
  it('identifica a quinzena oposta do tripulante', () => {
    expect(isOppositeTripulanteQuinzenaDay(1, 2)).toBe(true);
    expect(isOppositeTripulanteQuinzenaDay(2, 1)).toBe(true);
  });

  it('retorna false para a mesma quinzena ou quando o tripulante nao tem quinzena', () => {
    expect(isOppositeTripulanteQuinzenaDay(1, 1)).toBe(false);
    expect(isOppositeTripulanteQuinzenaDay(2, 2)).toBe(false);
    expect(isOppositeTripulanteQuinzenaDay(null, 1)).toBe(false);
  });
});
