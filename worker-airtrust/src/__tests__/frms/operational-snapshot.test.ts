import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  calculateMorningEffectivenessProjection,
  deriveCostaDoSolMissionEvidenceForDate,
  type BuildOperationalSnapshotInput,
  type FrmsOperationalSnapshotItem,
  listFrmsOperationalSnapshot,
} from '../../lib/frms/operational-snapshot';
import * as jornadasModule from '../../lib/frms/db-service-jornadas';
import * as parameterGovernanceModule from '../../lib/frms/parameter-governance';
import { LEGACY_FORTNIGHT_POLICY } from '../../lib/frms/fortnight-indicator';
import { LIMITES_DEFAULT } from '../../lib/frms/types';

function createBaseInput(): BuildOperationalSnapshotInput {
  return {
    empresaId: 77,
    rows: {
      escalas: [],
      jornadas: [],
      checkins: [],
      effectiveness: [],
      funcionarios: [
        {
          id: 10,
          nome: 'Tripulante Dez',
          nome_guerra: 'DEZ',
          funcao: 'PILOTO',
          cargo: 'COMANDANTE',
          base: 'SBJR',
          aeronave: 'AW139',
        },
        {
          id: 11,
          nome: 'Tripulante Onze',
          nome_guerra: 'ONZE',
          funcao: 'COPILOTO',
          cargo: 'SIC',
          base: 'SBJR',
          aeronave: 'SK76',
        },
      ],
    },
  };
}

function getByKey(items: FrmsOperationalSnapshotItem[], data: string, funcionarioId: number) {
  return items.find(
    (item) => item.data_operacional === data && item.funcionario_id === funcionarioId,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});


describe('active fortnight daily roster', () => {
  it('mantém visível o tripulante da quinzena mesmo sem voo, jornada ou check-in no dia', () => {
    const input = createBaseInput();
    input.rows.roster = [{ data_operacional: '2026-09-28', funcionario_id: 11 }];

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-09-28', 11);

    expect(item).toBeTruthy();
    expect(item?.nome_guerra).toBe('ONZE');
    expect(item?.escalado).toBe(false);
    expect(item?.teve_jornada).toBe(false);
    expect(item?.jornada_data_source).toBe('AUSENTE');
    expect(item?.operacao_requer_decisao).toBe(false);
    expect(item?.estado_operacional).toBe('NORMAL');
  });
});

describe('effectiveness threshold governance', () => {
  it('usa EFFECTIV_VERMELHO_MAX da revisão efetiva em vez de limiar fixo', () => {
    const input = createBaseInput();
    input.limites = { FDP_MAXIMO_HORAS: 11, HV_DIARIA_HORAS: 8, EFFECTIV_VERMELHO_MAX: 72 };
    input.rows.checkins = [{
      data_operacional: '2026-09-26', funcionario_id: 10, hora_checkin: '06:30',
      hora_apresentacao: '07:00', kss_score: 3, horas_sono: 7, qualidade_sono: 4,
      wake_time: '05:30', score_fadiga: 0, nivel_fadiga: 'NORMAL',
      status_operacional: 'APTO', computed_risk_level: 'LOW',
    }];
    input.rows.effectiveness = [{
      data_operacional: '2026-09-26', funcionario_id: 10,
      effectiveness_pct: 70, effectiveness_nivel: null,
    }];
    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-09-26', 10);
    expect(item?.alertas).toContain('EFETIVIDADE_BAIXA');
  });
});

// ---------------------------------------------------------------------------
// Helpers para os testes de janela de contexto do Compliance quinzenal.
// ---------------------------------------------------------------------------
interface SnapshotDbData {
  escalas?: Array<Record<string, unknown>>;
  jornadas?: Array<Record<string, unknown>>;
  checkins?: Array<Record<string, unknown>>;
  effectiveness?: Array<Record<string, unknown>>;
  funcionarios?: Array<Record<string, unknown>>;
  missionPeriods?: Array<Record<string, unknown>>;
}

/**
 * D1 fake que respeita a janela de datas do bind (`?, data_inicio, data_fim`),
 * para que os testes consigam distinguir "intervalo solicitado" de "contexto
 * interno de cálculo".
 */
function makeSnapshotDb(data: SnapshotDbData) {
  const rowsFor = (sql: string): Array<Record<string, unknown>> => {
    if (sql.includes('frms_fatorizacao_jornada')) return data.effectiveness ?? [];
    if (sql.includes('FROM frms_fadiga_checkin')) return data.checkins ?? [];
    if (sql.includes('escala_voo_diaria')) return data.escalas ?? [];
    if (sql.includes('FROM frms_jornada')) return data.jornadas ?? [];
    if (sql.includes('BASE_FORTNIGHT') && sql.includes('source_kind')) return data.missionPeriods ?? [];
    if (sql.includes('FROM funcionarios')) return data.funcionarios ?? [];
    return [];
  };

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => {
        if (args.length > 100) throw new Error('D1_ERROR: too many SQL variables: SQLITE_ERROR');
        return { all: async () => {
          const rows = rowsFor(sql);
          if (sql.includes('BASE_FORTNIGHT') && sql.includes('source_kind')) {
            return { results: rows };
          }
          if (sql.includes('FROM funcionarios')) {
            const requestedIds = new Set(args.slice(1).map(Number));
            return { results: rows.filter((row) => requestedIds.has(Number(row.id))) };
          }
          const janelaInicio = String(args[1]);
          const janelaFim = String(args[2]);
          return {
            results: rows.filter((row) => {
              const dia = String(row.data_operacional);
              return dia >= janelaInicio && dia <= janelaFim;
            }),
          };
        } };
      }),
    })),
  } as never;
}

function mockFrmsOperationalContext() {
  vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext').mockResolvedValue({
    empresaId: 77,
    profileCode: 'LEGACY_GENERAL',
    regulatoryProfileId: 'profile-1',
    configRevisionId: 'rev-1',
    modelVersion: 'FRMS_CONFIG_V1_TEST',
    effectiveFrom: '2000-01-01',
    effectiveTo: null,
    parameters: LIMITES_DEFAULT,
    fadigaPolicy: {} as never,
    fortnightPolicy: LEGACY_FORTNIGHT_POLICY,
  } as never);
}

function isoRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

function jornadaRow(
  data: string,
  funcionarioId: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    data_operacional: data,
    funcionario_id: funcionarioId,
    hora_apresentacao: '08:00',
    hora_termino: '14:00',
    horas_voo_minutos: 120,
    duracao_jornada_minutos: 360,
    origem: 'SIGVOOS',
    has_operational_data: 1,
    is_manual_empty: 0,
    ...overrides,
  };
}

const FUNCIONARIO_10 = {
  id: 10,
  nome: 'Tripulante Dez',
  nome_guerra: 'DEZ',
  funcao: 'PILOTO',
  cargo: 'COMANDANTE',
  base: 'SBJR',
  aeronave: 'AW139',
};

describe('D1 bind budget do snapshot operacional', () => {
  it('carrega mais de 100 tripulantes em chunks sem exceder o limite de binds do D1', async () => {
    mockFrmsOperationalContext();
    vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);
    const funcionarios = Array.from({ length: 120 }, (_, index) => ({
      id: index + 1,
      nome: `Tripulante ${index + 1}`,
      nome_guerra: `T${index + 1}`,
      funcao: 'PILOTO', cargo: 'COMANDANTE', base: 'SBJR', aeronave: 'AW139',
    }));
    const checkins = funcionarios.map((funcionario) => ({
      data_operacional: '2026-09-28', funcionario_id: funcionario.id,
      hora_checkin: '06:00', hora_apresentacao: '07:00', kss_score: 3,
      horas_sono: 8, qualidade_sono: 4, wake_time: '05:30', score_fadiga: 10,
      nivel_fadiga: 'VERDE', status_operacional: 'APTO', computed_risk_level: 'normal',
    }));
    const db = makeSnapshotDb({ funcionarios, checkins });
    const result = await listFrmsOperationalSnapshot(db, {
      empresaId: 77, dataInicio: '2026-09-28', dataFim: '2026-09-28',
    });
    expect(result.items).toHaveLength(120);
  });
});

describe('active fortnight roster in listFrmsOperationalSnapshot', () => {
  it('gera a linha diária a partir da quinzena mesmo sem evento operacional', async () => {
    mockFrmsOperationalContext();
    vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue({ dia: 3, total: 15 } as never);
    const db = makeSnapshotDb({
      funcionarios: [FUNCIONARIO_10],
      missionPeriods: [{
        funcionario_id: 10,
        data_inicio_embarque: '2026-09-16',
        data_fim_embarque: '2026-09-30',
        source_priority: 2,
        source_kind: 'BASE_FORTNIGHT',
      }],
    });

    const result = await listFrmsOperationalSnapshot(db, {
      empresaId: 77, dataInicio: '2026-09-28', dataFim: '2026-09-28',
    });

    const item = getByKey(result.items, '2026-09-28', 10);
    expect(item).toBeTruthy();
    expect(item?.nome_guerra).toBe('DEZ');
    expect(item?.teve_jornada).toBe(false);
    expect(item?.jornada_data_source).toBe('AUSENTE');
    expect(item?.operacao_requer_decisao).toBe(false);
    expect(item?.estado_operacional).toBe('NORMAL');
  });
});

describe('Costa do Sol post-mission evidence derivation', () => {
  const mission = [{
    funcionario_id: 10,
    data_inicio_embarque: '2026-09-01',
    data_fim_embarque: '2026-09-17',
  }];
  const workByDate = Object.fromEntries(
    isoRange('2026-09-01', '2026-09-17').map((date) => [date, 60]),
  );
  const summary = {
    tripulante_id: 10, nome: 'Tripulante Dez', guerra: 'DEZ', funcao: 'PILOTO',
    trabalho_status: 'COMPLETE' as const, trabalho_mes_min: 17 * 60, trabalho_mes_conhecido_min: 17 * 60,
    trabalho_7d_max_min: 7 * 60, trabalho_14d_max_min: 14 * 60, voo_mes_min: 0,
    jornada_registrada_mes_min: 17 * 60, dias_com_jornada: 17, incomplete_reasons: [],
    incomplete_reasons_by_date: {}, trabalho_por_data_min: workByDate,
    trabalho_contexto_por_data_min: workByDate,
  };

  it('deriva 15 dias de folga após 17 dias efetivos e detecta retorno um dia cedo', () => {
    const evidence = deriveCostaDoSolMissionEvidenceForDate(summary, mission, 10, '2026-10-02', true);
    expect(evidence).toMatchObject({
      inMission: false,
      effectiveWorkDaysAtOperation: 17,
      postMissionRequiredOffDays: 15,
      postMissionCompletedOffDays: 14,
      postMissionDutyOnDate: true,
      postMissionRestEvidenceComplete: true,
    });
  });

  it('reconhece a folga completa no dia seguinte', () => {
    const evidence = deriveCostaDoSolMissionEvidenceForDate(summary, mission, 10, '2026-10-03', true);
    expect(evidence).toMatchObject({
      postMissionRequiredOffDays: 15,
      postMissionCompletedOffDays: 15,
    });
  });

  it('não transforma trabalho antecipado em folga apenas porque a data avançou', () => {
    const withEarlyDuty = {
      ...summary,
      trabalho_contexto_por_data_min: { ...workByDate, '2026-10-02': 60 },
    };
    const evidence = deriveCostaDoSolMissionEvidenceForDate(withEarlyDuty, mission, 10, '2026-10-03', true);
    expect(evidence).toMatchObject({
      postMissionRequiredOffDays: 15,
      postMissionCompletedOffDays: 14,
    });
  });

  it('falha fechado quando existe atividade sem período operacional resolvível', () => {
    const evidence = deriveCostaDoSolMissionEvidenceForDate(summary, [], 10, '2026-10-03', true);
    expect(evidence).toMatchObject({
      inMission: false,
      postMissionDutyOnDate: true,
      postMissionRestEvidenceComplete: false,
    });
    expect(evidence?.incompleteReasons).toContain('ACT_CDS_MISSION_PERIOD_EVIDENCE_MISSING');
  });

  it('prioriza alocação formal quando mais de um período cobre a mesma data', () => {
    const periods = [
      { funcionario_id: 10, data_inicio_embarque: '2026-09-01', data_fim_embarque: '2026-09-15', source_priority: 2, source_kind: 'BASE_FORTNIGHT' as const },
      { funcionario_id: 10, data_inicio_embarque: '2026-09-10', data_fim_embarque: '2026-09-24', source_priority: 1, source_kind: 'ALLOCATION' as const },
    ];
    const evidence = deriveCostaDoSolMissionEvidenceForDate(summary, periods, 10, '2026-09-12', true);
    expect(evidence?.missionDay).toBe(3);
  });
});

describe('morning effectiveness projection', () => {
  it('calcula efetividade na apresentação a partir de check-in completo sem inventar jornada futura', () => {
    const projected = calculateMorningEffectivenessProjection({
      dataOperacional: '2026-09-25',
      funcionarioId: 10,
      presentationTime: '06:30',
      wakeTime: '05:00',
      sleepHours: 7,
      limites: LIMITES_DEFAULT,
      diaPeriodo: 2,
      totalDiasPeriodo: 14,
    });

    expect(projected).not.toBeNull();
    expect(projected?.source).toBe('PROJETADA_APRESENTACAO');
    expect(projected?.effectiveness_pct).toEqual(expect.any(Number));
    expect(projected?.effectiveness_componentes).toEqual(
      expect.objectContaining({
        processo_s: expect.any(Number),
        processo_c: expect.any(Number),
        repouso: expect.any(Number),
        hv: expect.any(Number),
        duracao: expect.any(Number),
      }),
    );
    expect(projected?.effectiveness_pct).toBeGreaterThanOrEqual(0);
    expect(projected?.effectiveness_pct).toBeLessThanOrEqual(100);
  });

  it('incorpora simulador planejado na projeção como HV equivalente FRMS', () => {
    const projected = calculateMorningEffectivenessProjection({
      dataOperacional: '2026-09-25',
      funcionarioId: 10,
      presentationTime: '23:00',
      wakeTime: '08:00',
      sleepHours: 8,
      limites: LIMITES_DEFAULT,
      plannedEndTime: '02:00',
      plannedActivityMinutes: 180,
      frmsFlightEquivalentMinutes: 180,
      diaPeriodo: 3,
      totalDiasPeriodo: 14,
    });

    expect(projected).not.toBeNull();
    expect(projected?.source).toBe('PROJETADA_ATIVIDADE');
    expect(projected?.effectiveness_pct).toEqual(expect.any(Number));
  });

  it('permanece fail-closed quando o check-in não tem sono/despertar/apresentação completos', () => {
    expect(
      calculateMorningEffectivenessProjection({
        dataOperacional: '2026-09-25',
        funcionarioId: 10,
        presentationTime: '06:30',
        wakeTime: null,
        sleepHours: 7,
        limites: LIMITES_DEFAULT,
      }),
    ).toBeNull();
  });
});

describe('frms operational snapshot builder', () => {
  it('1) escalado com check-in real e fatorização', () => {
    const input = createBaseInput();

    input.rows.escalas.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '15:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });

    input.rows.jornadas.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '15:00',
      horas_voo_minutos: 180,
      duracao_jornada_minutos: 420,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    input.rows.checkins.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      hora_checkin: '06:45',
      hora_apresentacao: '08:00',
      kss_score: 4,
      horas_sono: 7,
      qualidade_sono: 4,
      wake_time: '06:10',
      score_fadiga: 28,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    input.rows.effectiveness.push({
      data_operacional: '2026-05-25',
      funcionario_id: 10,
      effectiveness_pct: 95.3,
      effectiveness_nivel: 'VERDE',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-25', 10);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(true);
    expect(item?.checkin_status).toBe('RECEBIDO');
    expect(item?.sleep_data_source).toBe('REAL');
    expect(item?.effectiveness_pct).toBe(95.3);
    expect(item?.fatorizacao_status).toBe('CALCULADA');
  });

  it('2) escalado sem check-in gera CHECKIN_PENDENTE', () => {
    const input = createBaseInput();

    input.rows.escalas.push({
      data_operacional: '2026-05-26',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '14:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-26', 10);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(true);
    expect(item?.teve_jornada).toBe(false);
    expect(item?.jornada_data_source).toBe('AUSENTE');
    expect(item?.checkin_status).toBe('PENDENTE');
    expect(item?.alertas).toContain('CHECKIN_PENDENTE');
    expect(item?.alertas).toContain('ESCALADO_SEM_JORNADA_FRMS');
  });

  it('3) jornada FRMS sem escala gera alerta de divergência', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-26',
      funcionario_id: 11,
      hora_apresentacao: '07:00',
      hora_termino: '10:00',
      horas_voo_minutos: 90,
      duracao_jornada_minutos: 180,
      origem: 'FIRA',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-26', 11);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(false);
    expect(item?.teve_jornada).toBe(true);
    expect(item?.alertas).toContain('JORNADA_FRMS_SEM_ESCALA');
  });

  it('4) check-in sem jornada permanece visível como sinal operacional', () => {
    const input = createBaseInput();

    input.rows.checkins.push({
      data_operacional: '2026-05-27',
      funcionario_id: 11,
      hora_checkin: '06:10',
      hora_apresentacao: '08:00',
      kss_score: 5,
      horas_sono: 6.5,
      qualidade_sono: 3,
      wake_time: '05:40',
      score_fadiga: 36,
      nivel_fadiga: 'AMARELO',
      status_operacional: 'MONITORAR',
      computed_risk_level: 'attention',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-27', 11);

    expect(item).toBeTruthy();
    expect(item?.escalado).toBe(false);
    expect(item?.teve_jornada).toBe(false);
    expect(item?.checkin_status).toBe('RECEBIDO');
  });

  it('4b) placeholder manual vazio do check-in não vira voo 0h nem inconsistência', () => {
    const input = createBaseInput();
    input.rows.jornadas.push({
      data_operacional: '2026-05-27',
      funcionario_id: 10,
      hora_apresentacao: '06:00',
      hora_termino: null,
      horas_voo_minutos: 0,
      duracao_jornada_minutos: 0,
      origem: 'MANUAL',
      has_operational_data: 0,
      is_manual_empty: 1,
    });
    input.rows.checkins.push({
      data_operacional: '2026-05-27',
      funcionario_id: 10,
      hora_checkin: '05:30',
      hora_apresentacao: '06:00',
      kss_score: 4,
      horas_sono: 7,
      qualidade_sono: 4,
      wake_time: '04:30',
      score_fadiga: 20,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-05-27', 10);
    expect(item?.teve_jornada).toBe(false);
    expect(item?.teve_atividade_frms).toBe(false);
    expect(item?.atividade_principal).toBe('SEM_DADO');
    expect(item?.horas_voo_minutos).toBe(0);
    expect(item?.jornada_data_source).toBe('AUSENTE');
    expect(item?.alertas).not.toContain('DADO_INCONSISTENTE');
    expect(item?.alertas).not.toContain('JORNADA_SEM_FATORIZACAO');
  });

  it('5) usa sono REAL somente quando informado no check-in e não estima ausência', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-28',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '13:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 300,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    input.rows.checkins.push({
      data_operacional: '2026-05-28',
      funcionario_id: 10,
      hora_checkin: '06:30',
      hora_apresentacao: '08:00',
      kss_score: 4,
      horas_sono: 7.2,
      qualidade_sono: 4,
      wake_time: '05:55',
      score_fadiga: 20,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    input.rows.jornadas.push({
      data_operacional: '2026-05-28',
      funcionario_id: 11,
      hora_apresentacao: '09:00',
      hora_termino: '12:00',
      horas_voo_minutos: 60,
      duracao_jornada_minutos: 180,
      origem: 'MANUAL',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const realSleep = getByKey(result.items, '2026-05-28', 10);
    const estimatedSleep = getByKey(result.items, '2026-05-28', 11);

    expect(realSleep?.sleep_data_source).toBe('REAL');
    expect(estimatedSleep?.sleep_data_source).toBe('AUSENTE');
    expect(estimatedSleep?.wake_data_source).toBe('AUSENTE');
    expect(estimatedSleep?.horas_sono).toBeNull();
    expect(estimatedSleep?.alertas).not.toContain('SONO_ESTIMADO');
  });

  it('6) jornada sem effectiveness_pct gera JORNADA_SEM_FATORIZACAO', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-29',
      funcionario_id: 10,
      hora_apresentacao: '10:00',
      hora_termino: '14:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 240,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-29', 10);

    expect(item).toBeTruthy();
    expect(item?.effectiveness_pct).toBeNull();
    expect(item?.alertas).toContain('JORNADA_SEM_FATORIZACAO');
    expect(item?.fatorizacao_status).toBe('AUSENTE');
  });

  it('7) jornada operacional realizada prevalece na janela exibida; check-in continua obrigatório para efetividade', () => {
    const input = createBaseInput();

    input.rows.escalas.push({
      data_operacional: '2026-05-30',
      funcionario_id: 10,
      hora_apresentacao: '06:00',
      hora_termino: '13:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });
    input.rows.jornadas.push({
      data_operacional: '2026-05-30',
      funcionario_id: 10,
      hora_apresentacao: '06:15',
      hora_termino: '13:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 240,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });
    input.rows.checkins.push({
      data_operacional: '2026-05-30',
      funcionario_id: 10,
      hora_checkin: '06:30',
      hora_apresentacao: '09:00',
      kss_score: 4,
      horas_sono: 7.5,
      qualidade_sono: 4,
      wake_time: '07:15',
      score_fadiga: 20,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });
    input.rows.effectiveness.push({
      data_operacional: '2026-05-30',
      funcionario_id: 10,
      effectiveness_pct: 94,
      effectiveness_nivel: 'VERDE',
    });

    const result = buildFrmsOperationalSnapshot(input);
    const item = getByKey(result.items, '2026-05-30', 10);

    expect(item?.hora_apresentacao).toBe('06:15');
    expect(item?.hora_acordar).toBe('07:15');
    expect(item?.horas_sono).toBe(7.5);
    expect(item?.effectiveness_pct).toBe(94);

    const missing = createBaseInput();
    missing.rows.jornadas.push({
      data_operacional: '2026-05-31',
      funcionario_id: 10,
      hora_apresentacao: '06:00',
      hora_termino: '12:00',
      horas_voo_minutos: 90,
      duracao_jornada_minutos: 180,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });
    missing.rows.effectiveness.push({
      data_operacional: '2026-05-31',
      funcionario_id: 10,
      effectiveness_pct: 99,
      effectiveness_nivel: 'VERDE',
    });
    const missingItem = getByKey(buildFrmsOperationalSnapshot(missing).items, '2026-05-31', 10);
    expect(missingItem?.hora_apresentacao).toBe('06:00');
    expect(missingItem?.hora_acordar).toBeNull();
    expect(missingItem?.horas_sono).toBeNull();
    expect(missingItem?.effectiveness_pct).toBeNull();
  });

  it('7b) check-in existente mas incompleto é marcado INCOMPLETO e não exibe efetividade histórica', () => {
    const input = createBaseInput();
    input.rows.jornadas.push({
      data_operacional: '2026-06-02',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '14:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 360,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });
    input.rows.checkins.push({
      data_operacional: '2026-06-02',
      funcionario_id: 10,
      hora_checkin: '06:30',
      hora_apresentacao: null,
      kss_score: 4,
      horas_sono: 7,
      qualidade_sono: 4,
      wake_time: '05:55',
      score_fadiga: 20,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });
    input.rows.effectiveness.push({
      data_operacional: '2026-06-02',
      funcionario_id: 10,
      effectiveness_pct: 96,
      effectiveness_nivel: 'VERDE',
    });

    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-06-02', 10);
    expect(item?.snapshot_status).toBe('INCOMPLETO');
    expect(item?.alertas).toContain('DADO_INCONSISTENTE');
    expect(item?.effectiveness_pct).toBeNull();
  });

  it('conta treinamento em sala como atividade FRMS sem gerar HV', () => {
    const input = createBaseInput();
    input.rows.activities = [{
      data_operacional: '2026-09-23',
      funcionario_id: 10,
      activity_type: 'TREINAMENTO',
      hora_inicio: '08:00',
      hora_fim: '17:00',
      titulo: 'Treinamento em sala',
      source_id: 300,
    }];

    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-09-23', 10);
    expect(item).toBeTruthy();
    expect(item?.teve_atividade_frms).toBe(true);
    expect(item?.atividade_principal).toBe('TREINAMENTO');
    expect(item?.treinamento_minutos).toBe(540);
    expect(item?.horas_voo_minutos).toBe(0);
    expect(item?.horas_voo_frms_minutos).toBe(0);
    expect(item?.checkin_status).toBe('PENDENTE');
  });

  it('conta simulador como atividade e HV equivalente FRMS sem contaminar HV real', () => {
    const input = createBaseInput();
    input.rows.activities = [{
      data_operacional: '2026-09-24',
      funcionario_id: 10,
      activity_type: 'SIMULADOR',
      hora_inicio: '23:00',
      hora_fim: '02:00',
      titulo: 'Emergências AW139',
      source_id: 301,
    }];

    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-09-24', 10);
    expect(item).toBeTruthy();
    expect(item?.teve_atividade_frms).toBe(true);
    expect(item?.atividade_principal).toBe('SIMULADOR');
    expect(item?.simulador_minutos).toBe(180);
    expect(item?.horas_voo_minutos).toBe(0);
    expect(item?.horas_voo_frms_minutos).toBe(180);
    expect(item?.atividade_hora_inicio).toBe('23:00');
    expect(item?.atividade_hora_fim).toBe('02:00');
  });

  it('8) snapshot operacional preenche dia/total quinzenal via calcularDiaDoCiclo quando falta fatorizacao', async () => {
    mockFrmsOperationalContext();
    vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue({ dia: 4, total: 15 });

    const db = makeSnapshotDb({
      funcionarios: [FUNCIONARIO_10],
      checkins: [
        {
          data_operacional: '2026-06-19',
          funcionario_id: 10,
          hora_checkin: '05:40',
      hora_apresentacao: '08:00',
          kss_score: 8,
          horas_sono: 5,
          qualidade_sono: 4,
          wake_time: '05:10',
          score_fadiga: 20,
          nivel_fadiga: 'VERDE',
          status_operacional: 'APTO',
          computed_risk_level: 'normal',
        },
      ],
    });

    const result = await listFrmsOperationalSnapshot(db, {
      empresaId: 77,
      dataInicio: '2026-06-19',
      dataFim: '2026-06-19',
    });

    const item = getByKey(result.items, '2026-06-19', 10);

    expect(item).toBeTruthy();
    expect(item?.fortnight_indicator?.dia_periodo).toBe(4);
    expect(item?.fortnight_indicator?.total_dias_periodo).toBe(15);
    // Com contexto suficiente o período embarcado é reconhecido: não fica INCOMPLETO.
    expect(item?.fortnight_indicator?.fonte_periodo).not.toBe('INCOMPLETO');
    expect(item?.fortnight_indicator?.alertas_quinzena).not.toContain('PERIODO_QUINZENA_AUSENTE');
    expect(item?.fortnight_indicator?.alertas_quinzena).not.toContain('PERIODO_PARCIAL_NA_CONSULTA');
    expect(item?.fortnight_indicator?.agravantes_aplicados.map((entry) => entry.codigo)).toEqual(
      expect.arrayContaining(['SONO_INSUFICIENTE_NO_PERIODO', 'KSS_ALTO_NO_PERIODO']),
    );
  });

  describe('janela de contexto do Compliance quinzenal', () => {
    it('Caso 1 — consulta de um dia dentro de um período embarcado calcula o Compliance com dados reais', async () => {
      mockFrmsOperationalContext();
      // Âncora vem da fatorização persistida; ciclo não precisa resolver nada.
      vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);

      const db = makeSnapshotDb({
        funcionarios: [FUNCIONARIO_10],
        // Período completo 2026-06-16..2026-06-30, com jornadas reais registradas.
        jornadas: isoRange('2026-06-16', '2026-06-24').map((dia) => jornadaRow(dia, 10)),
        effectiveness: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            effectiveness_pct: 92,
            effectiveness_nivel: 'VERDE',
            dia_periodo_embarcado: 4,
            total_dias_periodo: 15,
          },
        ],
      });

      const result = await listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-19',
        dataFim: '2026-06-19',
      });

      // API retorna somente o item solicitado.
      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.data_operacional).toBe('2026-06-19');

      const indicator = result.items[0]?.fortnight_indicator;
      expect(indicator).toBeTruthy();
      expect(indicator?.fonte_periodo).not.toBe('INCOMPLETO');
      expect(['OK', 'ATENCAO', 'CRITICO']).toContain(indicator?.status_quinzena);
      expect(indicator?.alertas_quinzena).not.toContain('PERIODO_PARCIAL_NA_CONSULTA');
    });

    it('Caso 2 — rolling de 168h enxerga jornada dos 6 dias anteriores ao dia consultado', async () => {
      mockFrmsOperationalContext();
      vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);

      const db = makeSnapshotDb({
        funcionarios: [FUNCIONARIO_10],
        jornadas: [
          // 5 dias antes do dia consultado — fora do intervalo pedido, dentro do rolling 168h.
          jornadaRow('2026-06-14', 10, {
            hora_apresentacao: '06:00',
            hora_termino: '18:00',
            horas_voo_minutos: 240,
            duracao_jornada_minutos: 600,
          }),
          jornadaRow('2026-06-19', 10, {
            hora_apresentacao: '08:00',
            hora_termino: '13:00',
            horas_voo_minutos: 120,
            duracao_jornada_minutos: 300,
          }),
        ],
        effectiveness: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            effectiveness_pct: 88,
            effectiveness_nivel: 'VERDE',
            dia_periodo_embarcado: 4,
            total_dias_periodo: 15,
          },
        ],
      });

      const result = await listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-19',
        dataFim: '2026-06-19',
      });

      const indicator = result.items[0]?.fortnight_indicator;
      expect(indicator).toBeTruthy();
      // Inclui 2026-06-14 (240 + 120 de voo; 600 + 300 de duty).
      expect(indicator?.horas_voo_168h_min ?? 0).toBeGreaterThanOrEqual(360);
      expect(indicator?.duty_time_168h_min ?? 0).toBeGreaterThanOrEqual(900);
    });

    it('Caso 3 — sem período/ciclo resolvível permanece INCOMPLETO e fail-closed', async () => {
      mockFrmsOperationalContext();
      vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);

      const db = makeSnapshotDb({
        funcionarios: [FUNCIONARIO_10],
        checkins: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            hora_checkin: '05:40',
      hora_apresentacao: '08:00',
            kss_score: 6,
            horas_sono: 6,
            qualidade_sono: 3,
            wake_time: '05:10',
            score_fadiga: 30,
            nivel_fadiga: 'VERDE',
            status_operacional: 'APTO',
            computed_risk_level: 'normal',
          },
        ],
      });

      const result = await listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-19',
        dataFim: '2026-06-19',
      });

      const indicator = result.items[0]?.fortnight_indicator;
      expect(indicator?.status_quinzena).toBe('INCOMPLETO');
      expect(indicator?.alertas_quinzena).toContain('PERIODO_QUINZENA_AUSENTE');
    });

    it('Caso 4 — resposta não vaza os dias de contexto carregados internamente', async () => {
      mockFrmsOperationalContext();
      vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);

      const db = makeSnapshotDb({
        funcionarios: [FUNCIONARIO_10],
        jornadas: isoRange('2026-06-16', '2026-06-27').map((dia) => jornadaRow(dia, 10)),
        effectiveness: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            effectiveness_pct: 90,
            effectiveness_nivel: 'VERDE',
            dia_periodo_embarcado: 4,
            total_dias_periodo: 15,
          },
        ],
      });

      const result = await listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-19',
        dataFim: '2026-06-19',
      });

      expect(result.items).toHaveLength(1);
      expect(result.items.every((item) => item.data_operacional === '2026-06-19')).toBe(true);
    });

    it('Caso 5 — filtro de apresentação não remove jornada histórica do acumulado quinzenal', async () => {
      mockFrmsOperationalContext();
      vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue(null);

      const db = makeSnapshotDb({
        funcionarios: [FUNCIONARIO_10],
        escalas: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            hora_apresentacao: '08:00',
            hora_termino: '13:00',
            aeronave_prefixo: 'PR-ATX',
            aeronave_modelo: 'AW139',
          },
        ],
        jornadas: [
          // Dia dentro do intervalo pedido, mas classificado ATENCAO (sono estimado) —
          // será filtrado da resposta por status=['OK'], mas seu duty deve continuar no acumulado.
          jornadaRow('2026-06-17', 10, { duracao_jornada_minutos: 480, horas_voo_minutos: 160 }),
          jornadaRow('2026-06-19', 10, { duracao_jornada_minutos: 300, horas_voo_minutos: 120 }),
        ],
        checkins: [
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            hora_checkin: '06:30',
      hora_apresentacao: '08:00',
            kss_score: 3,
            horas_sono: 7,
            qualidade_sono: 4,
            wake_time: '05:55',
            score_fadiga: 18,
            nivel_fadiga: 'VERDE',
            status_operacional: 'APTO',
            computed_risk_level: 'normal',
          },
        ],
        effectiveness: [
          {
            data_operacional: '2026-06-17',
            funcionario_id: 10,
            effectiveness_pct: 85,
            effectiveness_nivel: 'VERDE',
            dia_periodo_embarcado: 2,
            total_dias_periodo: 15,
          },
          {
            data_operacional: '2026-06-19',
            funcionario_id: 10,
            effectiveness_pct: 95,
            effectiveness_nivel: 'VERDE',
            dia_periodo_embarcado: 4,
            total_dias_periodo: 15,
          },
        ],
      });

      const result = await listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-16',
        dataFim: '2026-06-19',
        filters: { status: ['OK'] },
      });

      // 2026-06-17 sai da resposta pelo filtro de status.
      expect(result.items.some((item) => item.data_operacional === '2026-06-17')).toBe(false);

      const item19 = result.items.find((item) => item.data_operacional === '2026-06-19');
      expect(item19).toBeTruthy();
      // O duty de 2026-06-17 (480) continua somado no período (480 + 300).
      expect(item19?.fortnight_indicator?.duty_time_periodo_min ?? 0).toBeGreaterThanOrEqual(780);
    });
  });

  it('9) exclui mecanico que entrou apenas por check-in no snapshot backend', () => {
    const input = createBaseInput();
    input.rows.funcionarios.push({
      id: 12,
      nome: 'Mecanico Doze',
      nome_guerra: 'MEC12',
      funcao: 'MECANICO',
      cargo: 'MANUTENCAO',
      base: 'SBJR',
      aeronave: 'AW139',
    });
    input.rows.checkins.push({
      data_operacional: '2026-05-31',
      funcionario_id: 12,
      hora_checkin: '07:10',
      hora_apresentacao: '08:00',
      kss_score: 3,
      horas_sono: 7,
      qualidade_sono: 4,
      wake_time: '06:15',
      score_fadiga: 10,
      nivel_fadiga: 'VERDE',
      status_operacional: 'APTO',
      computed_risk_level: 'normal',
    });

    const result = buildFrmsOperationalSnapshot(input);

    expect(getByKey(result.items, '2026-05-31', 12)).toBeUndefined();
  });

  it('10) exclui funcao ausente mesmo quando existe jornada importada', () => {
    const input = createBaseInput();
    input.rows.funcionarios.push({
      id: 13,
      nome: 'Cadastro Incompleto',
      nome_guerra: 'INC13',
      funcao: null,
      cargo: null,
      base: 'SBJR',
      aeronave: 'AW139',
    });
    input.rows.jornadas.push({
      data_operacional: '2026-06-01',
      funcionario_id: 13,
      hora_apresentacao: '08:00',
      hora_termino: '12:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 240,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const result = buildFrmsOperationalSnapshot(input);

    expect(getByKey(result.items, '2026-06-01', 13)).toBeUndefined();
  });

  it('11) fail-closed: sem perfil FRMS vigente para a empresa, listFrmsOperationalSnapshot propaga erro em vez de LIMITES_DEFAULT/LEGACY_FORTNIGHT_POLICY', async () => {
    vi.spyOn(parameterGovernanceModule, 'resolveFrmsOperationalContext').mockRejectedValue(
      Object.assign(new Error('Expected exactly one effective FRMS profile assignment for empresa=77.'), {
        code: 'FRMS_CONTEXT_UNAVAILABLE',
      }),
    );

    const db = { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } as never;

    await expect(
      listFrmsOperationalSnapshot(db, {
        empresaId: 77,
        dataInicio: '2026-06-19',
        dataFim: '2026-06-19',
      }),
    ).rejects.toMatchObject({ code: 'FRMS_CONTEXT_UNAVAILABLE' });
  });
});
describe('operational snapshot — mandatory compliance wiring', () => {
  function completeCheckinInput() {
    const input = createBaseInput();
    input.rows.checkins.push({
      data_operacional: '2026-09-26', funcionario_id: 10, hora_checkin: '06:00',
      hora_apresentacao: '08:00', kss_score: 3, horas_sono: 8, qualidade_sono: 4,
      wake_time: '06:00', score_fadiga: 10, nivel_fadiga: 'VERDE',
      status_operacional: 'APTO', computed_risk_level: 'normal',
    });
    input.rows.effectiveness.push({
      data_operacional: '2026-09-26', funcionario_id: 10,
      effectiveness_pct: 96, effectiveness_nivel: 'VERDE',
    });
    input.regulatoryProfileConfigured = true;
    return input;
  }

  it('eleva violação normativa comprovada para CRITICO_VIOLACAO', () => {
    const input = completeCheckinInput();
    input.regulatoryComplianceByKey = {
      '2026-09-26::10': {
        status: 'VIOLATION', unknownReasons: [],
        violations: [{
          code: 'LAW_HELI_FLIGHT_MONTH_90H', source: 'LAW',
          reference: 'Lei 13.475/2017 art. 33 IV', actualMin: 5401, limitMin: 5400,
          message: 'Horas de voo no mês calendário: 5401 min > 5400 min',
        }],
      },
    };
    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-09-26', 10);
    expect(item?.compliance_status).toBe('VIOLATION');
    expect(item?.estado_operacional).toBe('CRITICO_VIOLACAO');
    expect(item?.motivos_principais[0]).toContain('5401 min > 5400 min');
  });

  it('falha fechado quando compliance obrigatório não pode ser calculado', () => {
    const input = completeCheckinInput();
    input.regulatoryComplianceByKey = {
      '2026-09-26::10': {
        status: 'UNKNOWN', violations: [], unknownReasons: ['WORK_TIME_EVIDENCE_MISSING'],
      },
    };
    const item = getByKey(buildFrmsOperationalSnapshot(input).items, '2026-09-26', 10);
    expect(item?.compliance_status).toBe('UNKNOWN');
    expect(item?.estado_operacional).toBe('NAO_AVALIADO');
    expect(item?.compliance_unknown_reasons).toContain('WORK_TIME_EVIDENCE_MISSING');
    expect(item?.motivos_principais).toContain(
      'Histórico de jornada e trabalho ainda incompleto para a avaliação regulatória',
    );
    expect(item?.motivos_principais.join(' ')).not.toContain('WORK_TIME_EVIDENCE_MISSING');
  });
});
