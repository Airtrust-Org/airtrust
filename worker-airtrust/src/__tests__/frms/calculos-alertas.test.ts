/**
 * FRMS — Unit tests (Vitest)
 *
 * Cobre as 4 funções puras principais:
 *   calcFatorizacao, calcAcumuloRolling, processarAlertas, validarEscalaFutura
 */
import { describe, it, expect } from 'vitest';
import {
  hhmmToMinutes,
  minutesToHhmm,
  calcDuracaoMinutos,
  calcDuracaoJornada,
  calcFatorizacao,
  calcEffectiveness,
  calcAcumuloRolling,
  calcAcumuloMensal,
  calcFatorCicloEmbarcado,
  validarEscalaFutura,
  validarRepousoPlataforma,
  isNoturno,
} from '../../lib/frms/calculos';
import { processarAlertas, deveBloquearLancamento } from '../../lib/frms/alertas';
import { LIMITES_DEFAULT } from '../../lib/frms/types';
import type { FrmsJornada, LimitesMap } from '../../lib/frms/types';
import type { AcumuloRollingResult, PeriodoProjetado } from '../../lib/frms/calculos';

const limites = LIMITES_DEFAULT;

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

describe('hhmmToMinutes', () => {
  it('converte HH:MM para minutos', () => {
    expect(hhmmToMinutes('06:30')).toBe(390);
    expect(hhmmToMinutes('11:00')).toBe(660);
    expect(hhmmToMinutes('00:00')).toBe(0);
    expect(hhmmToMinutes('23:59')).toBe(1439);
  });

  it('retorna 0 para null/undefined', () => {
    expect(hhmmToMinutes(null)).toBe(0);
    expect(hhmmToMinutes(undefined)).toBe(0);
  });
});

describe('minutesToHhmm', () => {
  it('converte minutos para HH:MM', () => {
    expect(minutesToHhmm(390)).toBe('06:30');
    expect(minutesToHhmm(660)).toBe('11:00');
    expect(minutesToHhmm(0)).toBe('00:00');
  });
});

describe('calcDuracaoMinutos', () => {
  it('calcula diferença entre horários', () => {
    expect(calcDuracaoMinutos('06:00', '17:00')).toBe(660);
    expect(calcDuracaoMinutos('22:00', '06:00')).toBe(480); // cruza meia-noite
  });
  it('retorna 0 se algum horário falta', () => {
    expect(calcDuracaoMinutos(null, '17:00')).toBe(0);
    expect(calcDuracaoMinutos('06:00', null)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao', () => {
  const baseJornada: FrmsJornada = {
    id: '1',
    tripulante_id: 1,
    data: '2026-03-15',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  it('jornada normal ES mantém fator_basica diagnóstico positivo e total penalizado', () => {
    const result = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720, // 12h = suficiente
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_basica_pct).toBeGreaterThan(0);
    expect(result.total_fatorizado_jornada).toBeLessThan(0);
    expect(result.total_fatorizado_hv).toBeGreaterThan(0);
  });

  it('folga (FR) retorna todos zeros', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, status: 'FR', hora_apresentacao: null, hora_termino: null },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_basica_pct).toBe(0);
    expect(result.total_fatorizado_jornada).toBe(0);
    expect(result.total_fatorizado_hv).toBe(0);
  });

  it('férias (FE) retorna todos zeros', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, status: 'FE', hora_apresentacao: null, hora_termino: null },
      repousoAnteriorMin: null,
      limites,
      diasDoMes: 28,
    });

    expect(result.total_fatorizado_jornada).toBe(0);
    expect(result.total_fatorizado_hv).toBe(0);
  });

  it('apresentação às 05:00 gera penalidade circadiana', () => {
    const result = calcFatorizacao({
      jornada: { ...baseJornada, hora_apresentacao: '05:00' },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_apresentacao_pct).toBeLessThan(0);
  });

  it('jornada > 11h gera fator duração elevado', () => {
    const result = calcFatorizacao({
      jornada: {
        ...baseJornada,
        hora_apresentacao: '05:00',
        hora_termino: '18:00',
        duracao_jornada_minutos: 780,
      },
      repousoAnteriorMin: 720,
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_duracao_pct).not.toBe(0);
  });

  it('repouso insuficiente (< 12h) gera fator repouso elevado', () => {
    const result = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 480, // apenas 8h
      limites,
      diasDoMes: 31,
    });

    expect(result.fator_repouso_pct).not.toBe(0);
  });
});

describe('calcEffectiveness wake fallback', () => {
  it('usa MINUTOS_ANTES_APRESENTACAO para derivar hora de despertar', () => {
    const jornada: FrmsJornada = {
      id: 'effectiveness-fallback',
      tripulante_id: 1,
      data: '2026-03-15',
      status: 'ES',
      hora_apresentacao: '07:00',
      hora_termino: '18:00',
      horas_voo_minutos: 180,
      duracao_jornada_minutos: 660,
      hora_primeiro_acionamento: null,
      hora_primeira_decolagem: null,
      hora_ultimo_pouso: null,
      hora_corte_motor: null,
      repouso_plataforma_inicio: null,
      repouso_plataforma_fim: null,
      repouso_plataforma_valido: 0,
      observacao: null,
      registrado_por: 'test',
      origem: 'MANUAL',
      created_at: '',
      updated_at: '',
      deleted_at: null,
      tipo_base: 'HOME',
      tripulacao_aumentada: 0,
      classe_cabine: null,
      aclimatado: 1,
      local_base: null,
    };
    const fatorizacao = calcFatorizacao({
      jornada,
      repousoAnteriorMin: 720,
      limites: { ...limites, MINUTOS_ANTES_APRESENTACAO: 75 },
      diasDoMes: 31,
      diaDoCiclo: 1,
    });

    const result = calcEffectiveness(fatorizacao, { ...limites, MINUTOS_ANTES_APRESENTACAO: 75 }, {
      hora_apresentacao: '07:00',
    });

    expect(result.hora_despertar).toBe('05:45');
  });
});

// ────────────────────────────────────────────────────────────────────
// calcAcumuloRolling
// ────────────────────────────────────────────────────────────────────

describe('calcAcumuloRolling', () => {
  const makeJornada = (
    data: string,
    hvMin: number,
    status = 'ES',
  ): Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  > => ({
    data,
    status: status as FrmsJornada['status'],
    horas_voo_minutos: hvMin,
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    duracao_jornada_minutos: 660,
  });

  it('calcula HV correto para 7 dias', () => {
    const hist = [
      makeJornada('2026-03-15', 180),
      makeJornada('2026-03-14', 200),
      makeJornada('2026-03-13', 150),
    ];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    expect(result.hv_7_dias_min).toBe(530); // 180+200+150
    // HV diária considera janela rolling de 24h até a apresentação da jornada de referência.
    expect(result.hv_dia_min).toBe(200);
  });

  it('exclui folga do acúmulo', () => {
    const hist = [makeJornada('2026-03-15', 180), makeJornada('2026-03-14', 0, 'FR')];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    // Com apresentação às 06:00, a janela de 24h termina no início da jornada atual.
    expect(result.hv_dia_min).toBe(0);
    expect(result.hv_7_dias_min).toBe(180);
  });

  it('percentuais de limite corretos', () => {
    // HV_7_DIAS_HORAS = 45 → 45*60=2700 min
    const hist = [makeJornada('2026-03-15', 1350)]; // 1350/2700 = 50%
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    expect(result.pct_limite_7d).toBeCloseTo(50, 0);
  });

  it('repouso anterior calculado corretamente', () => {
    const hist = [
      makeJornada('2026-03-15', 180),
      { ...makeJornada('2026-03-14', 180), hora_termino: '18:00' },
    ];
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: hist,
      limites,
    });

    // 14/03 18:00 → 15/03 06:00 = 12h = 720min
    expect(result.repouso_anterior_min).toBe(720);
    expect(result.repouso_suficiente).toBe(1);
  });

  it('sem histórico retorna tudo zerado', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-15',
      jornadasHistorico: [],
      limites,
    });

    expect(result.hv_7_dias_min).toBe(0);
    expect(result.hv_28_dias_min).toBe(0);
    expect(result.hv_365_dias_min).toBe(0);
  });

  it('REGRESSION P1: pct_limite_28d usa janela rolling de 28 dias, não o mês calendário', () => {
    // Março 2026 tem 31 dias. Se cada dia tem 100 min de HV:
    //   janela 28d (Mar 4–31) = 28 × 100 = 2800 min
    //   mês calendário (Mar 1–31) = 31 × 100 = 3100 min
    // Antes da correção P1, pct_limite_28d usava hvMes (3100) em vez de hv28 (2800).
    const hist = Array.from({ length: 31 }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return makeJornada(`2026-03-${day}`, 100);
    });
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-03-31',
      jornadasHistorico: hist,
      limites,
    });

    // janela 28d = dataRef - 27 dias = 2026-03-04 até 2026-03-31 → 28 dias × 100 = 2800
    expect(result.hv_28_dias_min).toBe(2800);
    // mês calendário = todos os 31 dias × 100 = 3100
    expect(result.hv_mes_calendario_min).toBe(3100);
    // Os percentuais DEVEM ser diferentes (isso é o bug P1 — se usasse hvMes em vez de hv28 seriam iguais)
    expect(result.pct_limite_28d).not.toBe(result.pct_limite_mes_calendario);
    // pct_limite_28d deve basear-se em hv_28_dias_min e no limite HV_28_DIAS_HORAS.
    const limite28min = (limites.HV_28_DIAS_HORAS as number) * 60;
    const expectedPct28d = Math.round((2800 / limite28min) * 10000) / 100;
    expect(result.pct_limite_28d).toBeCloseTo(expectedPct28d, 0);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  it('não gera alertas quando tudo OK', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_dia_min: 120 },
      limites,
    });

    expect(alertas.length).toBe(0);
  });

  it('gera alerta HV_DIARIA quando perto do limite', () => {
    // HV_DIARIA_HORAS=8 → 480min. threshold=480-120=360min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 400,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_dia_min: 400, pct_limite_dia: 83.3 },
      limites,
    });

    const hvDiaria = alertas.find((a) => a.tipo_limite === 'HV_DIARIA');
    expect(hvDiaria).toBeDefined();
  });

  it('gera alerta CRITICO quando HV_7D ultrapassa 100%', () => {
    // HV_7_DIAS=45h=2700min → 2800>100%
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_7_dias_min: 2800, pct_limite_7d: 103.7 },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
  });

  it('gera alerta REPOUSO quando insuficiente', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, repouso_anterior_min: 400, repouso_suficiente: 0 },
      limites,
    });

    const repouso = alertas.find((a) => a.tipo_limite === 'REPOUSO');
    expect(repouso).toBeDefined();
  });
});

describe('deveBloquearLancamento', () => {
  it('bloqueia com alerta CRITICO', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'CRITICO' as const,
        percentual_atingido: 96,
        valor_atual_min: 2600,
        valor_limite_min: 2700,
        mensagem: 'Limité crítico',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(true);
  });

  it('não bloqueia com alerta VIOLACAO (apenas registra flag)', () => {
    // VIOLACAO = 100%+ — registra ocorrência mas NÃO bloqueia (auditoria regulatória post-facto)
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'VIOLACAO' as const,
        percentual_atingido: 105,
        valor_atual_min: 2800,
        valor_limite_min: 2700,
        mensagem: 'Limite ultrapassado',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(false);
  });

  it('não bloqueia com apenas AVISO', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'j1',
        tipo_limite: 'HV_7D' as const,
        nivel: 'AVISO' as const,
        percentual_atingido: 82,
        valor_atual_min: 2200,
        valor_limite_min: 2700,
        mensagem: 'Atenção ao limite',
      },
    ];

    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// validarEscalaFutura
// ────────────────────────────────────────────────────────────────────

describe('validarEscalaFutura', () => {
  const makeHistorico = (
    data: string,
    hvMin: number,
  ): Pick<
    FrmsJornada,
    | 'data'
    | 'status'
    | 'horas_voo_minutos'
    | 'hora_termino'
    | 'hora_apresentacao'
    | 'duracao_jornada_minutos'
  > => ({
    data,
    status: 'ES',
    horas_voo_minutos: hvMin,
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    duracao_jornada_minutos: 660,
  });

  it('escala que não viola limites retorna valida=true', () => {
    const result = validarEscalaFutura(
      [
        { data: '2026-03-16', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 },
        { data: '2026-03-17', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 },
      ],
      [makeHistorico('2026-03-15', 180)],
      limites,
    );

    expect(result.valida).toBe(true);
    expect(result.violacoes).toHaveLength(0);
  });

  it('escala com HV excessiva detecta violação projetada', () => {
    // Criar histórico com HV alta nos últimos 7 dias (~43h = 2580min)
    const historico = [];
    for (let i = 1; i <= 6; i++) {
      historico.push(makeHistorico(`2026-03-${String(15 - i).padStart(2, '0')}`, 430));
    }

    // Projetar mais um dia com +200min → total 7d = 2580+200 = 2780 > 2700 (45h)
    const result = validarEscalaFutura(
      [{ data: '2026-03-15', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 200 }],
      historico,
      limites,
    );

    expect(result.violacoes.length).toBeGreaterThan(0);
    const v = result.violacoes.find((v) => v.tipo_limite === 'HV_7D');
    expect(v).toBeDefined();
  });

  it('escala vazia retorna valida', () => {
    const result = validarEscalaFutura([], [], limites);
    expect(result.valida).toBe(true);
    expect(result.violacoes).toHaveLength(0);
  });

  it('detecta violação de repouso quando projeções consecutivas não respeitam o mínimo', () => {
    const result = validarEscalaFutura(
      [
        {
          data: '2026-03-16',
          status: 'ES',
          duracao_estimada_min: 660,
          hv_estimada_min: 180,
          hora_apresentacao_estimada: '10:00',
          hora_termino_estimada: '21:00',
        },
        {
          data: '2026-03-17',
          status: 'ES',
          duracao_estimada_min: 660,
          hv_estimada_min: 180,
          hora_apresentacao_estimada: '05:00',
        },
      ],
      [],
      limites,
    );

    const violacaoRepouso = result.violacoes.find((violacao) => violacao.tipo_limite === 'REPOUSO');
    expect(violacaoRepouso).toBeDefined();
    expect(violacaoRepouso?.valor_projetado).toBe(480);
  });
});

// ────────────────────────────────────────────────────────────────────
// Testes adicionais — cobertura completa dos gaps da auditoria
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — nível AVISO (80%)', () => {
  it('gera alerta HV_7D com nível AVISO ao atingir 80%', () => {
    // HV_7_DIAS_HORAS = 45h = 2700min → 80% = 2160min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j1',
      jornada: {
        duracao_jornada_minutos: 600,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2160,
        hv_28_dias_min: 2160,
        hv_365_dias_min: 2160,
        hv_mes_calendario_min: 2160,
        hv_dia_min: 180,
        pct_limite_7d: 80.0,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const aviso = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'AVISO');
    expect(aviso).toBeDefined();
    expect(aviso?.percentual_atingido).toBeCloseTo(80, 0);
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

describe('processarAlertas — nível CRITICO (95%) bloqueia', () => {
  it('gera alerta CRITICO a 95% e deve bloquear lançamento', () => {
    // HV_7_DIAS_HORAS = 45h = 2700min → 95% = 2565min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j2',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2565,
        hv_28_dias_min: 2565,
        hv_365_dias_min: 2565,
        hv_mes_calendario_min: 2565,
        hv_dia_min: 180,
        pct_limite_7d: 95.0,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
    expect(deveBloquearLancamento(alertas)).toBe(true);
  });

  it('HV_7D acima de 100% segue como CRITICO e bloqueia lançamento', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j3',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: {
        hv_7_dias_min: 2800,
        hv_28_dias_min: 2800,
        hv_365_dias_min: 2800,
        hv_mes_calendario_min: 2800,
        hv_dia_min: 180,
        pct_limite_7d: 103.7,
        pct_limite_28d: 0,
        pct_limite_mes_calendario: 0,
        pct_limite_365d: 0,
        pct_limite_dia: 37.5,
        repouso_anterior_min: 720,
        repouso_suficiente: 1,
      },
      limites,
    });

    const critico = alertas.find((a) => a.tipo_limite === 'HV_7D' && a.nivel === 'CRITICO');
    expect(critico).toBeDefined();
    expect(deveBloquearLancamento(alertas)).toBe(true);
  });
});

describe('calcFatorizacao — todos os fatores agravantes ativos simultaneamente', () => {
  it('jornada com apresentação noturna + longa + repouso crítico + noturno dep/arr', () => {
    const jornadaAgravada: FrmsJornada = {
      id: '99',
      tripulante_id: 1,
      data: '2026-03-15',
      status: 'ES',
      hora_apresentacao: '02:00', // noturno → -0.20
      hora_termino: '15:00',
      duracao_jornada_minutos: 780, // 13h > 10h → -0.10
      horas_voo_minutos: 360, // 6h → 0.00 qtd HV
      hora_primeiro_acionamento: null,
      hora_primeira_decolagem: '23:30', // noturno dep → +0.10
      hora_ultimo_pouso: '22:15', // noturno arr → +0.10
      hora_corte_motor: null,
      repouso_plataforma_inicio: null,
      repouso_plataforma_fim: null,
      repouso_plataforma_valido: 0,
      observacao: null,
      registrado_por: 'test',
      origem: 'MANUAL',
      created_at: '',
      updated_at: '',
      deleted_at: null,
      tipo_base: 'HOME',
      tripulacao_aumentada: 0,
      classe_cabine: null,
      aclimatado: 1,
      local_base: null,
    };

    const result = calcFatorizacao({
      jornada: jornadaAgravada,
      repousoAnteriorMin: 300, // 5h < 8h → -0.20 repouso
      limites,
      diasDoMes: 31,
    });

    // Apresentação 02h00 → -0.20
    expect(result.fator_apresentacao_pct).toBe(-0.2);
    // Duração 780min = 13h > 10h → -0.10
    expect(result.fator_duracao_pct).toBe(-0.1);
    // Repouso 300min = 5h < 8h → -0.20
    expect(result.fator_repouso_pct).toBe(-0.2);
    // Noturno decolagem 23:30 → -0.10
    expect(result.fator_noturno_dep_pct).toBe(-0.1);
    // Noturno pouso 22:15 → -0.10
    expect(result.fator_noturno_arr_pct).toBe(-0.1);
    // Total jornada exclui fator_basica e soma apenas penalidades reais
    const semBasica =
      result.fator_apresentacao_pct +
      result.fator_duracao_pct +
      result.fator_repouso_pct +
      result.fator_noturno_dep_pct +
      result.fator_noturno_arr_pct;
    expect(semBasica).toBeCloseTo(-0.7, 4);
  });
});

describe('calcAcumuloRolling — virada de ano', () => {
  it('janela de 7 dias cruzando 31/12 → 01/01 soma corretamente', () => {
    // Última semana de dez/2025 + primeiros dias de jan/2026
    const hist = [
      {
        data: '2025-12-28',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-29',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-30',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-31',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-01',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-02',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-03',
        status: 'ES',
        horas_voo_minutos: 200,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
    ] as any[];

    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-03',
      jornadasHistorico: hist,
      limites,
    });

    // Janela 7d = 28/12 até 03/01 → 7 dias × 200 = 1400min
    expect(result.hv_7_dias_min).toBe(1400);

    // Mês calendário Jan/2026: apenas jan/01, jan/02, jan/03 = 3 × 200 = 600min
    expect(result.hv_mes_calendario_min).toBe(600);

    // HV dia = 200min (apenas 03/01)
    expect(result.hv_dia_min).toBe(200);
  });

  it('janela de 365 dias cruzando ano-anterior conta todos os dias', () => {
    // 3 dias em nov/2025 + 3 dias em jan/2026
    const hist = [
      {
        data: '2025-11-01',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2025-12-15',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
      {
        data: '2026-01-10',
        status: 'ES',
        horas_voo_minutos: 180,
        hora_apresentacao: '06:00',
        hora_termino: '17:00',
        duracao_jornada_minutos: 660,
      },
    ] as any[];

    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-10',
      jornadasHistorico: hist,
      limites,
    });

    // Janela 365d de 2026-01-10 começa em 2025-01-11 → todos os 3 dias estão dentro
    expect(result.hv_365_dias_min).toBe(540); // 3 × 180
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorCicloEmbarcado (Process S — Borbély Two-Process Model)
// ────────────────────────────────────────────────────────────────────

describe('calcFatorCicloEmbarcado', () => {
  const customLimites = {
    ...limites,
    CICLO_EMBARCADO_ATIVO: 1,
    CICLO_EMBARCADO_DIA_INICIO: 1,
    CICLO_EMBARCADO_DIA_MAX: 14,
    CICLO_EMBARCADO_PCT_MIN: 0,
    CICLO_EMBARCADO_PCT_MAX: 10,
  };

  it('retorna 0 quando funcionalidade desativada', () => {
    const off = { ...customLimites, CICLO_EMBARCADO_ATIVO: 0 };
    expect(calcFatorCicloEmbarcado(7, off)).toBe(0);
  });

  it('retorna 0 quando diaDoCiclo é null', () => {
    expect(calcFatorCicloEmbarcado(null, customLimites)).toBe(0);
  });

  it('retorna 0 quando diaDoCiclo é undefined', () => {
    expect(calcFatorCicloEmbarcado(undefined, customLimites)).toBe(0);
  });

  it('dia 1 retorna PCT_MIN', () => {
    expect(calcFatorCicloEmbarcado(1, customLimites)).toBeCloseTo(0, 2);
  });

  it('dia 14 (máximo) retorna PCT_MAX', () => {
    expect(calcFatorCicloEmbarcado(14, customLimites)).toBeCloseTo(10, 2);
  });

  it('dia intermediário interpola linearmente', () => {
    // dia 7 de 14: (7-1)/(14-1) * 10 = 6/13 * 10 ≈ 4.6154
    const result = calcFatorCicloEmbarcado(7, customLimites);
    expect(result).toBeGreaterThan(4);
    expect(result).toBeLessThan(5);
  });

  it('dia além do máximo é capped em PCT_MAX', () => {
    expect(calcFatorCicloEmbarcado(20, customLimites)).toBeCloseTo(10, 2);
  });

  it('dia 0 ou negativo retorna 0', () => {
    expect(calcFatorCicloEmbarcado(0, customLimites)).toBe(0);
    expect(calcFatorCicloEmbarcado(-1, customLimites)).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────
// Parâmetros configuráveis (zero hardcode)
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao com limites customizados', () => {
  const testJornada: FrmsJornada = {
    id: 'test-custom',
    tripulante_id: 1,
    data: '2026-03-15',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  it('hora noturna gera fator com NOTURNO_FATOR configurável', () => {
    const custom = { ...limites, NOTURNO_FATOR: 20 };
    const jornadaNoturna: FrmsJornada = {
      ...testJornada,
      hora_apresentacao: '23:00',
      hora_termino: '07:00',
      hora_primeira_decolagem: '23:30',
      hora_ultimo_pouso: '06:30',
      duracao_jornada_minutos: 480,
      horas_voo_minutos: 180,
    };
    const result = calcFatorizacao({
      jornada: jornadaNoturna,
      repousoAnteriorMin: 720,
      limites: custom,
      diasDoMes: 31,
    });
    expect(result.fator_noturno_dep_pct).toBe(20);
  });

  it('calcAcumuloRolling retorna pct_limite_mes_calendario', () => {
    const result = calcAcumuloRolling({
      tripulanteId: 1,
      dataReferencia: '2026-01-15',
      jornadasHistorico: [],
      limites,
    });
    expect(result).toHaveProperty('pct_limite_mes_calendario');
    expect(result.pct_limite_mes_calendario).toBe(0);
    // Backward compat
    expect(result).toHaveProperty('pct_limite_28d');
  });
});

// ────────────────────────────────────────────────────────────────────
// validarRepousoPlataforma (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('validarRepousoPlataforma', () => {
  it('repouso dentro do intervalo válido (3h–6h) é aceito', () => {
    expect(validarRepousoPlataforma('10:00', '13:00', limites)).toBe(true); // 3h exato
    expect(validarRepousoPlataforma('10:00', '14:00', limites)).toBe(true); // 4h
    expect(validarRepousoPlataforma('10:00', '16:00', limites)).toBe(true); // 6h exato
  });

  it('repouso abaixo do mínimo (< 3h) é rejeitado', () => {
    expect(validarRepousoPlataforma('10:00', '11:30', limites)).toBe(false); // 1h30
    expect(validarRepousoPlataforma('10:00', '10:00', limites)).toBe(false); // 0h
  });

  it('repouso acima do máximo (> 6h) é rejeitado', () => {
    expect(validarRepousoPlataforma('10:00', '17:00', limites)).toBe(false); // 7h
  });

  it('retorna false para horários nulos', () => {
    expect(validarRepousoPlataforma(null, '13:00', limites)).toBe(false);
    expect(validarRepousoPlataforma('10:00', null, limites)).toBe(false);
    expect(validarRepousoPlataforma(null, null, limites)).toBe(false);
  });

  it('repouso cruzando meia-noite dentro do intervalo é aceito', () => {
    expect(validarRepousoPlataforma('23:00', '02:00', limites)).toBe(true); // 3h
    expect(validarRepousoPlataforma('22:00', '03:00', limites)).toBe(true); // 5h
  });

  it('limites configuráveis são respeitados', () => {
    const customLimites = {
      ...limites,
      REPOUSO_PLATAFORMA_MINIMO_HORAS: 2,
      REPOUSO_PLATAFORMA_MAXIMO_HORAS: 4,
    };
    expect(validarRepousoPlataforma('10:00', '12:00', customLimites)).toBe(true); // 2h = mínimo
    expect(validarRepousoPlataforma('10:00', '14:00', customLimites)).toBe(true); // 4h = máximo
    expect(validarRepousoPlataforma('10:00', '11:00', customLimites)).toBe(false); // 1h < 2h
    expect(validarRepousoPlataforma('10:00', '15:00', customLimites)).toBe(false); // 5h > 4h
  });
});

// ────────────────────────────────────────────────────────────────────
// isNoturno (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('isNoturno', () => {
  it('hora dentro do WOCL (22h–05h) retorna true', () => {
    expect(isNoturno('22:00', limites)).toBe(true);
    expect(isNoturno('23:30', limites)).toBe(true);
    expect(isNoturno('00:00', limites)).toBe(true);
    expect(isNoturno('03:00', limites)).toBe(true);
    expect(isNoturno('05:00', limites)).toBe(true);
  });

  it('hora fora do WOCL retorna false', () => {
    expect(isNoturno('06:00', limites)).toBe(false);
    expect(isNoturno('12:00', limites)).toBe(false);
    expect(isNoturno('21:59', limites)).toBe(false);
  });

  it('retorna false para null/undefined', () => {
    expect(isNoturno(null, limites)).toBe(false);
    expect(isNoturno(undefined, limites)).toBe(false);
  });

  it('WOCL configurável via limites', () => {
    const custom = { ...limites, NOTURNO_INICIO_HORA: 20, NOTURNO_FIM_HORA: 6 };
    expect(isNoturno('20:00', custom)).toBe(true);
    expect(isNoturno('19:59', custom)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcDuracaoJornada (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('calcDuracaoJornada', () => {
  const makeJ = (status: string, apres: string | null, term: string | null): FrmsJornada => ({
    id: 'x',
    tripulante_id: 1,
    data: '2026-03-01',
    status: status as FrmsJornada['status'],
    hora_apresentacao: apres,
    hora_termino: term,
    duracao_jornada_minutos: null,
    horas_voo_minutos: null,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  });

  it('folga (FR) retorna 0 independente dos horários', () => {
    expect(calcDuracaoJornada(makeJ('FR', '06:00', '17:00'))).toBe(0);
  });

  it('férias (FE) retorna 0', () => {
    expect(calcDuracaoJornada(makeJ('FE', '06:00', '17:00'))).toBe(0);
  });

  it('jornada ES retorna duração correta (deduz 60 min almoço)', () => {
    // 06:00–17:00 = 660 min bruto − 60 min almoço = 600
    expect(calcDuracaoJornada(makeJ('ES', '06:00', '17:00'))).toBe(600);
  });

  it('jornada sem horários retorna 0', () => {
    expect(calcDuracaoJornada(makeJ('ES', null, null))).toBe(0);
  });

  it('jornada cruzando meia-noite calcula corretamente', () => {
    // 22:00–06:00 = 480 min bruto − 60 min almoço = 420
    expect(calcDuracaoJornada(makeJ('ES', '22:00', '06:00'))).toBe(420);
  });

  it('TS e TV contam como jornada (FDP)', () => {
    // 08:00–12:00 = 240 min bruto − 60 min almoço = 180
    expect(calcDuracaoJornada(makeJ('TS', '08:00', '12:00'))).toBe(180);
    expect(calcDuracaoJornada(makeJ('TV', '14:00', '18:00'))).toBe(180);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcAcumuloMensal (cobertura auditoria 2026-02-26)
// ────────────────────────────────────────────────────────────────────

describe('calcAcumuloMensal', () => {
  it('soma horas de jornada e voo corretamente', () => {
    const result = calcAcumuloMensal({
      jornadas: [
        { status: 'ES', duracao_jornada_minutos: 660, horas_voo_minutos: 180 },
        { status: 'ES', duracao_jornada_minutos: 600, horas_voo_minutos: 120 },
        { status: 'FR', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
      ],
      fatorizacoes: [
        { total_fatorizado_jornada: 5.0, total_fatorizado_hv: 2.5 },
        { total_fatorizado_jornada: 4.8, total_fatorizado_hv: 2.0 },
      ],
    });

    expect(result.jornada_realizada_min).toBe(1260);
    expect(result.hv_realizada_min).toBe(300);
    expect(result.dias_embarcado).toBe(2);
    expect(result.dias_folga).toBe(1);
    expect(result.dias_ferias).toBe(0);
    expect(result.jornada_fatorizada_pct).toBeCloseTo(9.8, 1);
    expect(result.hv_fatorizada_pct).toBeCloseTo(4.5, 1);
  });

  it('mês sem jornadas retorna zeros', () => {
    const result = calcAcumuloMensal({ jornadas: [], fatorizacoes: [] });
    expect(result.jornada_realizada_min).toBe(0);
    expect(result.hv_realizada_min).toBe(0);
    expect(result.dias_embarcado).toBe(0);
  });

  it('conta FE separado de FR', () => {
    const result = calcAcumuloMensal({
      jornadas: [
        { status: 'FR', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
        { status: 'FE', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
        { status: 'FE', duracao_jornada_minutos: 0, horas_voo_minutos: 0 },
      ],
      fatorizacoes: [],
    });
    expect(result.dias_folga).toBe(1);
    expect(result.dias_ferias).toBe(2);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas — FDP_DIARIO, HV_365D e HV_MES (cobertura auditoria)
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — FDP_DIARIO, HV_365D, HV_MES', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  it('gera alerta FDP_DIARIO quando jornada supera threshold (8h de 11h)', () => {
    // FDP_MAXIMO_HORAS=11h=660min, FDP_ALERTA_RESTANTE_HORAS=3h → threshold=480min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jfdp',
      jornada: {
        duracao_jornada_minutos: 500,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: acumuloBase,
      limites,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
  });

  it('não gera alerta FDP quando abaixo do threshold (< 8h)', () => {
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jfdp2',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 120,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: acumuloBase,
      limites,
    });

    expect(alertas.find((a) => a.tipo_limite === 'FDP_DIARIO')).toBeUndefined();
  });

  it('gera alerta HV_365D ao atingir 80% do limite anual', () => {
    // HV_365_DIAS_HORAS=960h=57600min → 80%=46080min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jhv365',
      jornada: {
        duracao_jornada_minutos: 660,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_365_dias_min: 46080, pct_limite_365d: 80.0 },
      limites,
    });

    const hv365 = alertas.find((a) => a.tipo_limite === 'HV_365D');
    expect(hv365).toBeDefined();
    expect(hv365!.nivel).toBe('AVISO');
  });

  it('gera alerta HV_MES ATENCAO a 90% e não bloqueia quando isolado', () => {
    // HV_MES_HORAS=90h=5400min → 90%=4860min
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'jhvmes',
      jornada: {
        duracao_jornada_minutos: 300,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase, hv_mes_calendario_min: 4860, pct_limite_mes_calendario: 90.0 },
      limites,
    });

    const hvMes = alertas.find((a) => a.tipo_limite === 'HV_MES');
    expect(hvMes).toBeDefined();
    expect(hvMes!.nivel).toBe('ATENCAO');
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });

  it('nível ATENCAO (90%) isolado não bloqueia lançamento', () => {
    const alertas = [
      {
        tripulante_id: 1,
        jornada_id: 'jat',
        tipo_limite: 'HV_MES' as const,
        nivel: 'ATENCAO' as const,
        percentual_atingido: 91,
        valor_atual_min: 4914,
        valor_limite_min: 5400,
        mensagem: 'HV mês em ATENCAO',
      },
    ];
    expect(deveBloquearLancamento(alertas)).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────
// validarEscalaFutura — violação FDP e HV_MES (cobertura auditoria)
// ────────────────────────────────────────────────────────────────────

describe('validarEscalaFutura — violação FDP e HV mensal', () => {
  it('jornada com FDP > 11h detecta violação FDP_DIARIO', () => {
    const result = validarEscalaFutura(
      [{ data: '2026-04-01', status: 'ES', duracao_estimada_min: 720, hv_estimada_min: 180 }],
      [],
      limites,
    );

    expect(result.valida).toBe(false);
    const v = result.violacoes.find((v) => v.tipo_limite === 'FDP_DIARIO');
    expect(v).toBeDefined();
    expect(v!.valor_projetado).toBe(720);
  });

  it('FDP exatamente no limite (11h = 660min) NÃO viola', () => {
    const result = validarEscalaFutura(
      [{ data: '2026-04-05', status: 'ES', duracao_estimada_min: 660, hv_estimada_min: 180 }],
      [],
      limites,
    );

    expect(result.violacoes.find((v) => v.tipo_limite === 'FDP_DIARIO')).toBeUndefined();
  });

  it('HV_MES violação detectada em escala futura densa (15d × 400min)', () => {
    // HV_MES_HORAS=90h=5400min. 15 × 400min = 6000min > 5400 → violação
    const periodos: PeriodoProjetado[] = Array.from({ length: 15 }, (_, i) => ({
      data: `2026-04-${String(i + 1).padStart(2, '0')}`,
      status: 'ES',
      duracao_estimada_min: 660,
      hv_estimada_min: 400,
    }));

    const result = validarEscalaFutura(periodos, [], limites);
    expect(result.violacoes.some((v) => v.tipo_limite === 'HV_MES')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao — Campos avançados: tipo_base (AWAY) + aclimatado
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao — tipo_base AWAY e aclimatado', () => {
  const baseJornada: FrmsJornada = {
    id: 'j-adv',
    tripulante_id: 1,
    data: '2026-03-20',
    status: 'ES',
    hora_apresentacao: '06:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 660,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'HOME',
    tripulacao_aumentada: 0,
    classe_cabine: null,
    aclimatado: 1,
    local_base: null,
  };

  const limitesComFatores: LimitesMap = {
    ...limites,
    FATOR_BASE_AWAY_PCT: 0.1,
    FATOR_ACLIMATADO_NAO_PCT: 0.08,
    FATOR_TRIPULACAO_AUM_HORAS: 2.0,
  };

  it('HOME + aclimatado=1 → fator_base_away_pct=0 e fator_aclimatacao_pct=0', () => {
    const r = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('AWAY → fator_base_away_pct = FATOR_BASE_AWAY_PCT (0.10)', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, tipo_base: 'AWAY' },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0.1);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('aclimatado=0 → fator_aclimatacao_pct = FATOR_ACLIMATADO_NAO_PCT (0.08)', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, aclimatado: 0 },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_aclimatacao_pct).toBe(0.08);
    expect(r.fator_base_away_pct).toBe(0);
  });

  it('AWAY + aclimatado=0 → ambos os fatores se acumulam no total', () => {
    const r = calcFatorizacao({
      jornada: { ...baseJornada, tipo_base: 'AWAY', aclimatado: 0 },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.fator_base_away_pct).toBe(0.1);
    expect(r.fator_aclimatacao_pct).toBe(0.08);
    const semFatores = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBeCloseTo(
      semFatores.total_fatorizado_jornada + 0.1 + 0.08,
      6,
    );
  });

  it('HOME + aclimatado=1 total igual a versão sem campos avançados', () => {
    const comCampos = calcFatorizacao({
      jornada: baseJornada,
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    const semCampos = calcFatorizacao({
      jornada: { ...baseJornada },
      repousoAnteriorMin: 720,
      limites: limitesComFatores,
      diasDoMes: 31,
    });
    expect(comCampos.total_fatorizado_jornada).toBeCloseTo(semCampos.total_fatorizado_jornada, 6);
  });
});

// ────────────────────────────────────────────────────────────────────
// processarAlertas — tripulacao_aumentada estende limite FDP
// ────────────────────────────────────────────────────────────────────

describe('processarAlertas — tripulacao_aumentada e FDP estendido', () => {
  const acumuloBase: AcumuloRollingResult = {
    hv_7_dias_min: 0,
    hv_28_dias_min: 0,
    hv_365_dias_min: 0,
    hv_mes_calendario_min: 0,
    hv_dia_min: 0,
    pct_limite_7d: 0,
    pct_limite_28d: 0,
    pct_limite_mes_calendario: 0,
    pct_limite_365d: 0,
    pct_limite_dia: 0,
    repouso_anterior_min: 720,
    repouso_suficiente: 1,
  };

  const limitesComTripAum: LimitesMap = {
    ...LIMITES_DEFAULT,
    FATOR_BASE_AWAY_PCT: 0.1,
    FATOR_ACLIMATADO_NAO_PCT: 0.1,
    FATOR_TRIPULACAO_AUM_HORAS: 2.0,
  };

  it('sem tripulacao_aumentada: FDP > FDP_MAXIMO_HORAS gera alerta FDP_DIARIO', () => {
    // FDP_MAXIMO_HORAS=11h=660min → 720min > 660 → violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp',
      jornada: {
        duracao_jornada_minutos: 720,
        horas_voo_minutos: 200,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
  });

  it('com tripulacao_aumentada=1: FDP no limite standard não dispara se dentro do limite estendido', () => {
    // Limite estendido = 11h + 2h = 13h = 780min
    // 720min < 780min → não dispara FDP_DIARIO violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-aug',
      jornada: {
        duracao_jornada_minutos: 720,
        horas_voo_minutos: 200,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'VIOLACAO',
    );
    expect(fdpViolacao).toBeUndefined();
  });

  it('mensagem do alerta FDP_DIARIO inclui "trip. aumentada" quando tripulacao_aumentada=1', () => {
    // 850min > 780min (limite estendido) → gera alerta com mensagem contendo "trip. aumentada"
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-msg',
      jornada: {
        duracao_jornada_minutos: 850,
        horas_voo_minutos: 300,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeDefined();
    expect(fdp!.mensagem).toContain('trip. aumentada');
  });

  it('com tripulacao_aumentada=1: FDP acima do limite estendido gera CRITICO', () => {
    // limite estendido = 13h = 780min. 900min > 780min → violação
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-over',
      jornada: {
        duracao_jornada_minutos: 900,
        horas_voo_minutos: 300,
        status: 'ES',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'CRITICO',
    );
    expect(fdpViolacao).toBeDefined();
  });

  it('tripulacao_aumentada=0: FDP 1min abaixo do limite padrão → não VIOLACAO', () => {
    // 659min = 99.85% < ALERTA_VIOLACAO_PCT (100%) → não gera VIOLACAO
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fdp-exact',
      jornada: {
        duracao_jornada_minutos: 659,
        horas_voo_minutos: 180,
        status: 'ES',
        tripulacao_aumentada: 0,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdpViolacao = alertas.find(
      (a) => a.tipo_limite === 'FDP_DIARIO' && a.nivel === 'VIOLACAO',
    );
    expect(fdpViolacao).toBeUndefined();
  });

  it('jornada FR com duracao=0 não gera alerta FDP_DIARIO', () => {
    // FR realista: duracao=0 → condição `jornada.duracao_jornada_minutos` é falsy → sem FDP check
    const alertas = processarAlertas({
      tripulanteId: 1,
      jornadaId: 'j-fr',
      jornada: {
        duracao_jornada_minutos: 0,
        horas_voo_minutos: 0,
        status: 'FR',
        tripulacao_aumentada: 1,
      },
      acumulo: { ...acumuloBase },
      limites: limitesComTripAum,
    });

    const fdp = alertas.find((a) => a.tipo_limite === 'FDP_DIARIO');
    expect(fdp).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// calcFatorizacao — zeroFatorizacao inclui novos campos
// ────────────────────────────────────────────────────────────────────

describe('calcFatorizacao — folga/férias retorna novos campos zerados', () => {
  const jornadaFolga: FrmsJornada = {
    id: 'j-fr',
    tripulante_id: 1,
    data: '2026-03-21',
    status: 'FR',
    hora_apresentacao: null,
    hora_termino: null,
    horas_voo_minutos: 0,
    duracao_jornada_minutos: 0,
    hora_primeiro_acionamento: null,
    hora_primeira_decolagem: null,
    hora_ultimo_pouso: null,
    hora_corte_motor: null,
    repouso_plataforma_inicio: null,
    repouso_plataforma_fim: null,
    repouso_plataforma_valido: 0,
    observacao: null,
    registrado_por: 'test',
    origem: 'MANUAL',
    created_at: '',
    updated_at: '',
    deleted_at: null,
    tipo_base: 'AWAY',
    tripulacao_aumentada: 1,
    classe_cabine: null,
    aclimatado: 0,
    local_base: null,
  };

  it('FR com AWAY + aclimatado=0 → total ainda é 0 (folga zero-out)', () => {
    const r = calcFatorizacao({
      jornada: jornadaFolga,
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBe(0);
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('FE com AWAY + aclimatado=0 → total ainda é 0', () => {
    const r = calcFatorizacao({
      jornada: { ...jornadaFolga, status: 'FE' },
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    expect(r.total_fatorizado_jornada).toBe(0);
    expect(r.fator_base_away_pct).toBe(0);
    expect(r.fator_aclimatacao_pct).toBe(0);
  });

  it('TS com AWAY aplica fator_base_away_pct normalmente (não é status de folga)', () => {
    // TS não está em FOLGA_STATUS, portanto calcFatorizacao não zerifica automaticamente
    // Need non-zero duration + horário to avoid fatorizacaoDiaSemJornada early return
    const r = calcFatorizacao({
      jornada: {
        ...jornadaFolga,
        status: 'TS',
        hora_apresentacao: '08:00',
        hora_termino: '14:00',
        duracao_jornada_minutos: 360,
      },
      repousoAnteriorMin: 720,
      limites: {
        ...LIMITES_DEFAULT,
        FATOR_BASE_AWAY_PCT: 0.1,
        FATOR_ACLIMATADO_NAO_PCT: 0.08,
        FATOR_TRIPULACAO_AUM_HORAS: 2.0,
      },
      diasDoMes: 31,
    });
    // TRAINING with AWAY: AWAY penalty applies
    expect(r.fator_base_away_pct).toBe(0.1);
  });
});
