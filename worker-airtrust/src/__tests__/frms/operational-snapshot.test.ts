import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  calculateMorningEffectivenessProjection,
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

// ---------------------------------------------------------------------------
// Helpers para os testes de janela de contexto do Compliance quinzenal.
// ---------------------------------------------------------------------------
interface SnapshotDbData {
  escalas?: Array<Record<string, unknown>>;
  jornadas?: Array<Record<string, unknown>>;
  checkins?: Array<Record<string, unknown>>;
  effectiveness?: Array<Record<string, unknown>>;
  funcionarios?: Array<Record<string, unknown>>;
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
    if (sql.includes('FROM funcionarios')) return data.funcionarios ?? [];
    return [];
  };

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        all: async () => {
          const rows = rowsFor(sql);
          if (sql.includes('FROM funcionarios')) {
            return { results: rows };
          }
          const janelaInicio = String(args[1]);
          const janelaFim = String(args[2]);
          return {
            results: rows.filter((row) => {
              const dia = String(row.data_operacional);
              return dia >= janelaInicio && dia <= janelaFim;
            }),
          };
        },
      })),
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

  it('7) apresentação do check-in prevalece sobre escala/jornada e ausência de check-in não gera fallback', () => {
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

    expect(item?.hora_apresentacao).toBe('09:00');
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
    expect(missingItem?.hora_apresentacao).toBeNull();
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