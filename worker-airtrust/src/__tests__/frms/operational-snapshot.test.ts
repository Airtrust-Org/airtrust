import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  type BuildOperationalSnapshotInput,
  type FrmsOperationalSnapshotItem,
  listFrmsOperationalSnapshot,
} from '../../lib/frms/operational-snapshot';
import * as configModule from '../../lib/frms/db-service-config';
import * as frmsConfigModule from '../../lib/frms/frms-config';
import * as jornadasModule from '../../lib/frms/db-service-jornadas';

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

  it('5) diferencia sono REAL vs ESTIMADO', () => {
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
    expect(estimatedSleep?.sleep_data_source).toBe('ESTIMADO');
    expect(estimatedSleep?.alertas).toContain('SONO_ESTIMADO');
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

  it('7) wake estimado respeita parâmetro configurável de minutos antes da apresentação', () => {
    const input = createBaseInput();

    input.rows.jornadas.push({
      data_operacional: '2026-05-30',
      funcionario_id: 10,
      hora_apresentacao: '09:00',
      hora_termino: '13:00',
      horas_voo_minutos: 120,
      duracao_jornada_minutos: 240,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });

    const defaultSnapshot = buildFrmsOperationalSnapshot(input);
    const customSnapshot = buildFrmsOperationalSnapshot({
      ...input,
      wakeFallbackLeadMinutes: 75,
    });

    const defaultItem = getByKey(defaultSnapshot.items, '2026-05-30', 10);
    const customItem = getByKey(customSnapshot.items, '2026-05-30', 10);

    expect(defaultItem?.wake_data_source).toBe('ESTIMADO');
    expect(defaultItem?.hora_acordar).toBe('07:30');
    expect(customItem?.wake_data_source).toBe('ESTIMADO');
    expect(customItem?.hora_acordar).toBe('07:45');
  });

  it('8) snapshot operacional usa fallback de quinzena base quando falta fatorizacao do dia', async () => {
    vi.spyOn(configModule, 'carregarLimites').mockResolvedValue({} as never);
    vi.spyOn(frmsConfigModule, 'resolverFrmsConfig').mockReturnValue({
      minutosAntesApresentacao: 90,
    } as never);
    vi.spyOn(jornadasModule, 'calcularDiaDoCiclo').mockResolvedValue({ dia: 4, total: 15 });

    const emptyAll = () => ({ all: async () => ({ results: [] }) });
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('FROM frms_fadiga_checkin')) {
          return {
            bind: () => ({
              all: async () => ({
                results: [
                  {
                    data_operacional: '2026-06-19',
                    funcionario_id: 10,
                    hora_checkin: '05:40',
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
              }),
            }),
          };
        }

        if (sql.includes('FROM funcionarios') && sql.includes('id IN')) {
          return {
            bind: () => ({
              all: async () => ({
                results: [
                  {
                    id: 10,
                    nome: 'Tripulante Dez',
                    nome_guerra: 'DEZ',
                    funcao: 'PILOTO',
                    cargo: 'COMANDANTE',
                    base: 'SBJR',
                    aeronave: 'AW139',
                  },
                ],
              }),
            }),
          };
        }

        return { bind: emptyAll };
      }),
    } as never;

    const result = await listFrmsOperationalSnapshot(db, {
      empresaId: 77,
      dataInicio: '2026-06-19',
      dataFim: '2026-06-19',
    });

    const item = getByKey(result.items, '2026-06-19', 10);

    expect(item).toBeTruthy();
    expect(item?.fortnight_indicator?.fonte_periodo).toBe('INCOMPLETO');
    expect(item?.fortnight_indicator?.dia_periodo).toBe(4);
    expect(item?.fortnight_indicator?.total_dias_periodo).toBe(15);
    expect(item?.fortnight_indicator?.alertas_quinzena).not.toContain('PERIODO_QUINZENA_AUSENTE');
    expect(item?.fortnight_indicator?.agravantes_aplicados.map((entry) => entry.codigo)).toEqual(
      expect.arrayContaining(['SONO_INSUFICIENTE_NO_PERIODO', 'KSS_ALTO_NO_PERIODO']),
    );
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
});
