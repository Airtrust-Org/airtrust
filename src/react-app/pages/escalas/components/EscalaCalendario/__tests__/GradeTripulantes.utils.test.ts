import { describe, expect, it } from 'vitest';

import {
  buildSyntheticAlocacoesFromEventos,
  buildTripulanteAlocacoesMap,
  chooseTripulanteDayAlocacao,
  isOppositeTripulanteQuinzenaDay,
  isSyntheticAlocacao,
  parseSyntheticId,
  SYNTHETIC_ID_PREFIX,
} from '../GradeTripulantes.utils';
import type {
  EscalaAlocacao,
  EscalaCoberturaTripulante,
  EscalaEvento,
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

// ── helpers for synthetic tests ──────────────────────────────────────────

function createEvento(partial: Partial<EscalaEvento>): EscalaEvento {
  return {
    id: partial.id || 'evt-1',
    escala_id: partial.escala_id || '1',
    tripulacao_id: partial.tripulacao_id ?? null,
    funcionario_id: partial.funcionario_id || 'func-1',
    funcionario_nome: partial.funcionario_nome || 'Tripulante Teste',
    funcionario_matricula: partial.funcionario_matricula || '12345',
    funcionario_cargo: partial.funcionario_cargo ?? 'comandante',
    tipo_evento: partial.tipo_evento || 'treinamento_simulador',
    data_inicio: partial.data_inicio || '2026-06-10',
    data_fim: partial.data_fim || '2026-06-10',
    turno: partial.turno ?? 'dia_todo',
    local: partial.local ?? null,
    aeronave: partial.aeronave ?? null,
    simulador_id: partial.simulador_id ?? null,
    gerado_automaticamente: partial.gerado_automaticamente ?? 1,
    motivo_automatico: partial.motivo_automatico ?? null,
    origem: partial.origem ?? 'simuladores',
    status: partial.status || 'confirmado',
    observacoes: partial.observacoes ?? null,
  };
}

// ── isSyntheticAlocacao & parseSyntheticId ───────────────────────────────

describe('isSyntheticAlocacao', () => {
  it('detecta alocacao sintetica pelo prefixo', () => {
    expect(isSyntheticAlocacao({ id: 'synthetic-treinamento_simulador-abc' })).toBe(true);
    expect(isSyntheticAlocacao({ id: 'aloc-1' })).toBe(false);
    expect(isSyntheticAlocacao({ id: '123' })).toBe(false);
    expect(isSyntheticAlocacao({ id: '' })).toBe(false);
  });
});

describe('parseSyntheticId', () => {
  it('extrai tipo_evento e eventoId do ID sintetico', () => {
    // Known tipo_evento 'treinamento_simulador' is matched even when evento.id contains hyphens
    const result = parseSyntheticId('synthetic-treinamento_simulador-abc-123');
    expect(result).toEqual({ tipoEvento: 'treinamento_simulador', eventoId: 'abc-123' });
  });

  it('extrai IDs com UUID no eventoId (contem hyphens)', () => {
    const result = parseSyntheticId('synthetic-ferias-550e8400-e29b-41d4-a716-446655440000');
    expect(result).toEqual({ tipoEvento: 'ferias', eventoId: '550e8400-e29b-41d4-a716-446655440000' });
  });

  it('retorna null para ids que nao sao sinteticos', () => {
    expect(parseSyntheticId('aloc-1')).toBeNull();
    expect(parseSyntheticId('123')).toBeNull();
  });
});

// ── buildSyntheticAlocacoesFromEventos ───────────────────────────────────

describe('buildSyntheticAlocacoesFromEventos', () => {
  it('mostra sessao de simulador para participante ativo', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-sim-1',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
          status: 'confirmado',
          data_inicio: '2026-06-15',
          data_fim: '2026-06-15',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('synthetic-treinamento_simulador-evt-sim-1');
    expect(result[0].situacao_tipo).toBe('SIM');
    expect(result[0].situacao_cor).toBe('#9333EA');
    expect(result[0].funcionario_id).toBe('func-10');
  });

  it('mostra simulador para instrutor (via evento com cargo)', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-instrutor',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'instr-1',
          funcionario_cargo: 'instrutor',
          escala_id: '1',
          status: 'confirmado',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['instr-1']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].situacao_tipo).toBe('SIM');
  });

  it('mostra examinador quando presente no evento', () => {
    // Examinador é tratado como participante do evento — mesmo funcionario_id
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-exam',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'exam-99',
          funcionario_cargo: 'examinador',
          escala_id: '1',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['exam-99']),
    });

    expect(result).toHaveLength(1);
  });

  it('sessao sem qualificacao associada aparece mesmo assim', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-sem-qual',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
          // sem qualificacao, sem turma — apenas o evento existe
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
  });

  it('sessao sem turma aparece mesmo assim', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-sem-turma',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
          tripulacao_id: null, // sem turma associada
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
  });

  it('sessao cancelada nao aparece', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-cancelado',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
          status: 'cancelado',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(0);
  });

  it('sessao cross-tenant nao aparece (escala_id diferente)', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-cross',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: 'outra-escala',
        }),
      ],
      escalaId: '1', // escala atual
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(0);
  });

  it('sessao so aparece para tripulantes na cobertura', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-1',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
        }),
        createEvento({
          id: 'evt-2',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-99',
          escala_id: '1',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']), // apenas func-10 na cobertura
    });

    expect(result).toHaveLength(1);
    expect(result[0].funcionario_id).toBe('func-10');
  });

  it('preserva data e horario corretamente', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({
          id: 'evt-data',
          tipo_evento: 'treinamento_simulador',
          funcionario_id: 'func-10',
          escala_id: '1',
          data_inicio: '2026-06-15',
          data_fim: '2026-06-16',
        }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].data_inicio).toBe('2026-06-15');
    expect(result[0].data_fim).toBe('2026-06-16');
  });

  // ── Safety: synthetic events must not be editable ────────────────────

  it('evento sintetico tem auto_gerado=true para nao ser tratado como alocacao manual', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-1', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].auto_gerado).toBe(true);
  });

  it('evento sintetico tem ID com prefixo sintetico para evitar colisao', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'abc-123', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^synthetic-/);
    // IDs sinteticos nunca colidem com IDs numericos do banco
    expect(typeof result[0].id).toBe('string');
    expect(Number.isNaN(Number(result[0].id))).toBe(true); // nao é puramente numerico
  });

  it('preserva origem nos observacoes para rastreabilidade', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({
        id: 'evt-src',
        tipo_evento: 'treinamento_simulador',
        funcionario_id: 'func-10',
        escala_id: '1',
        origem: 'simuladores',
        observacoes: 'Sessao de check',
      })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].observacoes).toContain('fonte: simuladores#evt-src');
    expect(result[0].observacoes).toContain('Sessao de check');
  });

  // ── Multi-type events ────────────────────────────────────────────────

  it('ferias aparecem na grade', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-ferias', tipo_evento: 'ferias', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].situacao_tipo).toBe('FERIAS');
    expect(result[0].situacao_cor).toBe('#16A34A');
  });

  it('licenca aparece na grade', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-lic', tipo_evento: 'licenca', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].situacao_tipo).toBe('AFT');
  });

  it('medico aparece na grade', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-med', tipo_evento: 'medico', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].situacao_tipo).toBe('MED');
  });

  it('treinamento aparece na grade', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-treino', tipo_evento: 'treinamento_solo', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    expect(result).toHaveLength(1);
    expect(result[0].situacao_tipo).toBe('CURSO');
  });

  it('cancelados nao aparecem independente do tipo', () => {
    const tipos = ['treinamento_simulador', 'ferias', 'licenca', 'medico', 'treinamento_solo'] as const;
    for (const tipo of tipos) {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [createEvento({ id: 'evt-x', tipo_evento: tipo, funcionario_id: 'func-10', escala_id: '1', status: 'cancelado' })],
        escalaId: '1',
        tripulanteIds: new Set(['func-10']),
      });
      expect(result, `tipo ${tipo} cancelado deve ser filtrado`).toHaveLength(0);
    }
  });

  it('vinculada a turma nao duplica — um evento por pessoa', () => {
    // Dois eventos com mesmo funcionario_id devem gerar uma alocacao sintetica cada
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [
        createEvento({ id: 'evt-a', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1' }),
        createEvento({ id: 'evt-b', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1' }),
      ],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    // Cada evento gera 1 alocacao sintetica — é esperado
    // O chooseTripulanteDayAlocacao decide qual mostrar por dia
    expect(result).toHaveLength(2);
    // Ambas pertencem ao mesmo tripulante
    expect(result.every((a) => a.funcionario_id === 'func-10')).toBe(true);
  });

  // ── Real × synthetic priority ─────────────────────────────────────────

  it('alocacao manual tem prioridade sobre sintetica no mesmo dia', () => {
    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-sim', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1', data_inicio: '2026-06-15', data_fim: '2026-06-15' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    const manual = createAlocacao({
      id: 'real-aloc',
      funcionario_id: 'func-10',
      situacao_tipo: 'SIM',
      auto_gerado: 0, // manual
      data_inicio: '2026-06-15',
      data_fim: '2026-06-15',
    });

    const chosen = chooseTripulanteDayAlocacao([...synthetic, manual], '2026-06-15');
    expect(chosen?.id).toBe('real-aloc');
  });

  it('alocacao sintetica respeita prioridade visual do tipo (FERIAS sobre operacional)', () => {
    // FERIAS has priority 0, operational has priority 2 — the higher visual priority wins
    // regardless of auto_gerado. The safety against editing synthetic events is in the
    // click handler (isSyntheticAlocacao guard), not in the display priority.
    const synthetic = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-ferias', tipo_evento: 'ferias', funcionario_id: 'func-10', escala_id: '1', data_inicio: '2026-06-15', data_fim: '2026-06-15' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    const operacional = createAlocacao({
      id: 'real-operacional',
      funcionario_id: 'func-10',
      aeronave_id: 10,
      aeronave_prefixo: 'PP-ABC',
      auto_gerado: 0,
      data_inicio: '2026-06-15',
      data_fim: '2026-06-15',
    });

    const chosen = chooseTripulanteDayAlocacao([...synthetic, operacional], '2026-06-15');
    // FERIAS (priority 0) shows over operational (priority 2) — correct visual hierarchy.
    // Synthetic events are still READ-ONLY via the click handler guard.
    expect(chosen?.situacao_tipo).toBe('FERIAS');
    // The chosen one is synthetic — but its click is trapped by isSyntheticAlocacao guard
    expect(chosen?.id).toMatch(/^synthetic-/);
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  it('retorna array vazio quando nao ha eventos', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });
    expect(result).toHaveLength(0);
  });

  it('retorna array vazio quando tripulanteIds esta vazio', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-1', tipo_evento: 'treinamento_simulador', funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(),
    });
    expect(result).toHaveLength(0);
  });

  it('ignora tipos de evento nao mapeados', () => {
    const result = buildSyntheticAlocacoesFromEventos({
      eventos: [createEvento({ id: 'evt-voo', tipo_evento: 'voo' as any, funcionario_id: 'func-10', escala_id: '1' })],
      escalaId: '1',
      tripulanteIds: new Set(['func-10']),
    });

    // 'voo' nao esta no EVENT_TYPE_TO_SITUACAO map
    expect(result).toHaveLength(0);
  });
});
