import { describe, expect, it } from 'vitest';
import {
  aggregateFlightDispatchAssessment,
  deriveCrewDispatchAssessment,
  type CrewDispatchAssessment,
  type DispatchGateCrewMember,
} from '../../services/controle-voos/frms-dispatch-gate';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

// Controle Operacional FRMS / Gate de Despacho V1 — testes da regra pura.
// Reusa exatamente os estados que `frms-operational-decision.ts` e
// `fortnight-indicator.ts` já produzem; nao inventa novo threshold.

function crewMember(overrides: Partial<DispatchGateCrewMember> = {}): DispatchGateCrewMember {
  return { funcionario_id: 1001, nome: 'Tripulante Teste', funcao: 'PIC', ...overrides };
}

function snapshotItem(
  overrides: Partial<FrmsOperationalSnapshotItem> = {},
): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-24',
    funcionario_id: 1001,
    tripulante_id: 1001,
    nome: 'Tripulante Teste',
    nome_guerra: null,
    funcao: 'PIC',
    base: null,
    aeronave: null,
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '16:00',
    horas_voo_minutos: 300,
    duracao_jornada_minutos: 480,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '07:30',
    kss_score: 3,
    horas_sono: 8,
    qualidade_sono: 4,
    hora_acordar: '06:00',
    fadiga_score: 10,
    status_operacional_checkin: 'NORMAL',
    effectiveness_pct: 95,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: null,
    snapshot_status: 'OK',
    fortnight_indicator: {
      periodo_inicio: '2026-08-10',
      periodo_fim: '2026-08-24',
      dia_periodo: 14,
      total_dias_periodo: 14,
      dias_consecutivos_com_jornada: 5,
      dias_com_checkin_pendente: 0,
      dias_com_dado_estimado: 0,
      duty_time_periodo_min: 3000,
      duty_time_168h_min: 3000,
      horas_voo_periodo_min: 1800,
      horas_voo_168h_min: 1800,
      jornadas_periodo: 10,
      apresentacoes_antes_0600: 0,
      apresentacoes_antes_0700: 1,
      menor_descanso_entre_jornadas_min: 660,
      setores_periodo: 12,
      sit_periods_estimados: 0,
      fonte_periodo: 'REAL',
      freshness_dado: 'COMPLETO',
      status_quinzena: 'OK',
      score_acumulado: 10,
      tendencia: 'ESTAVEL',
      atenuadores_aplicados: [],
      agravantes_aplicados: [],
      natureza_dado: 'ACUMULADO_LEGAL',
      explicacao_operacional: '',
      mitigacao_recomendada: 'SEM_ACAO',
      decisao: 'INFORMA',
      limite_referencia: null,
      alertas_quinzena: [],
      limitation_notes: [],
    },
    alertas: [],
    natureza_dado: 'JORNADA_REALIZADA',
    causa: '',
    mitigacao_recomendada: 'SEM_ACAO',
    decisao: 'INFORMA',
    limite_referencia: null,
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: '',
    ...overrides,
  };
}

describe('deriveCrewDispatchAssessment', () => {
  it('1) tripulante escalado hoje + check-in ausente => NAO_LIBERADO', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'AUSENTE' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('CHECKIN_DIARIO_PENDENTE');
  });

  it('check-in PENDENTE tambem bloqueia (nao so AUSENTE)', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'PENDENTE' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('CHECKIN_DIARIO_PENDENTE');
  });

  it('5) CRITICO_VIOLACAO bloqueia mesmo com check-in normal (RECEBIDO)', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'RECEBIDO', estado_operacional: 'CRITICO_VIOLACAO' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('DECISAO_FRMS_CRITICA');
    expect(result.reasons).not.toContain('CHECKIN_DIARIO_PENDENTE');
  });

  it('6) MITIGACAO_NECESSARIA bloqueia', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'RECEBIDO', estado_operacional: 'MITIGACAO_NECESSARIA' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('DECISAO_FRMS_MITIGACAO_NECESSARIA');
  });

  it('7a) NAO_AVALIADO nao vira verde', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'RECEBIDO', estado_operacional: 'NAO_AVALIADO' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('DECISAO_FRMS_NAO_AVALIADO');
  });

  it('7b) snapshot INCOMPLETO (dado inconsistente) nao vira verde', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'RECEBIDO', snapshot_status: 'INCOMPLETO' }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('SNAPSHOT_FRMS_INCONSISTENTE');
  });

  it('snapshot ausente para o tripulante (fail-closed) => NAO_LIBERADO', () => {
    const result = deriveCrewDispatchAssessment(crewMember(), undefined);
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toEqual(['SNAPSHOT_FRMS_AUSENTE']);
    expect(result.checkin_status).toBe('INDISPONIVEL');
  });

  it('fadiga acumulada CRITICA (quinzena) bloqueia mesmo com decisao diaria NORMAL', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({
        checkin_status: 'RECEBIDO',
        estado_operacional: 'NORMAL',
        fortnight_indicator: {
          ...snapshotItem().fortnight_indicator!,
          status_quinzena: 'CRITICO',
        },
      }),
    );
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.reasons).toContain('FADIGA_ACUMULADA_CRITICA');
    expect(result.fadiga_acumulada).toBe('CRITICO');
  });

  it('8) decisao ATENCAO aparece uma unica vez como revisao (nao bloqueia, nao explode em varios alertas)', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({
        checkin_status: 'RECEBIDO',
        estado_operacional: 'ATENCAO',
        alertas: ['KSS_ALTO', 'EFETIVIDADE_BAIXA'],
      }),
    );
    expect(result.frms_status).toBe('ATENCAO_COORDENACAO');
    expect(result.reasons).toEqual(['DECISAO_FRMS_ATENCAO']);
    expect(result.primary_reason).toBe('DECISAO_FRMS_ATENCAO');
  });

  it('fadiga acumulada em ATENCAO nao bloqueia, so sinaliza revisao', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({
        checkin_status: 'RECEBIDO',
        estado_operacional: 'NORMAL',
        fortnight_indicator: {
          ...snapshotItem().fortnight_indicator!,
          status_quinzena: 'ATENCAO',
        },
      }),
    );
    expect(result.frms_status).toBe('ATENCAO_COORDENACAO');
    expect(result.reasons).toContain('FADIGA_ACUMULADA_ATENCAO');
  });

  it('dado estimado nao bloqueia, so sinaliza revisao', () => {
    const result = deriveCrewDispatchAssessment(
      crewMember(),
      snapshotItem({ checkin_status: 'RECEBIDO', sleep_data_source: 'ESTIMADO' }),
    );
    expect(result.frms_status).toBe('ATENCAO_COORDENACAO');
    expect(result.reasons).toContain('DADO_ESTIMADO');
  });

  it('16) nenhum dado sensivel (KSS, sono, medicacao) aparece no resultado sanitizado', () => {
    const result = deriveCrewDispatchAssessment(crewMember(), snapshotItem());
    const serialized = JSON.stringify(result);
    expect(result).not.toHaveProperty('kss_score');
    expect(result).not.toHaveProperty('horas_sono');
    expect(result).not.toHaveProperty('qualidade_sono');
    expect(result).not.toHaveProperty('fadiga_score');
    expect(serialized).not.toMatch(/kss|sono|medica|alcool/i);
  });

  it('tudo normal + check-in recebido => LIBERAVEL', () => {
    const result = deriveCrewDispatchAssessment(crewMember(), snapshotItem());
    expect(result.frms_status).toBe('LIBERAVEL');
    expect(result.reasons).toEqual([]);
    expect(result.primary_reason).toBeNull();
  });
});

describe('aggregateFlightDispatchAssessment', () => {
  function assessed(overrides: Partial<CrewDispatchAssessment>): CrewDispatchAssessment {
    return {
      funcionario_id: 1,
      nome: 'X',
      funcao: 'PIC',
      frms_status: 'LIBERAVEL',
      checkin_status: 'RECEBIDO',
      fadiga_diaria: 'NORMAL',
      fadiga_acumulada: 'NORMAL',
      reasons: [],
      primary_reason: null,
      natureza_dado: null,
      ...overrides,
    };
  }

  it('2) dois tripulantes, um sem check-in => voo NAO_LIBERADO', () => {
    const result = aggregateFlightDispatchAssessment([
      assessed({ funcionario_id: 1 }),
      assessed({
        funcionario_id: 2,
        frms_status: 'NAO_LIBERADO',
        reasons: ['CHECKIN_DIARIO_PENDENTE'],
        primary_reason: 'CHECKIN_DIARIO_PENDENTE',
      }),
    ]);
    expect(result.frms_status).toBe('NAO_LIBERADO');
    expect(result.can_release).toBe(false);
    expect(result.frms_primary_reason).toBe('CHECKIN_DIARIO_PENDENTE');
  });

  it('voo LIBERAVEL quando toda a tripulacao esta LIBERAVEL', () => {
    const result = aggregateFlightDispatchAssessment([assessed({}), assessed({ funcionario_id: 2 })]);
    expect(result.frms_status).toBe('LIBERAVEL');
    expect(result.can_release).toBe(true);
  });

  it('voo ATENCAO_COORDENACAO quando ha atencao mas nenhum bloqueio', () => {
    const result = aggregateFlightDispatchAssessment([
      assessed({}),
      assessed({
        funcionario_id: 2,
        frms_status: 'ATENCAO_COORDENACAO',
        reasons: ['DECISAO_FRMS_ATENCAO'],
        primary_reason: 'DECISAO_FRMS_ATENCAO',
      }),
    ]);
    expect(result.frms_status).toBe('ATENCAO_COORDENACAO');
    expect(result.can_release).toBe(true);
  });

  it('voo sem tripulacao cadastrada e LIBERAVEL (nada a avaliar)', () => {
    const result = aggregateFlightDispatchAssessment([]);
    expect(result.frms_status).toBe('LIBERAVEL');
    expect(result.can_release).toBe(true);
    expect(result.frms_primary_reason).toBeNull();
  });
});
