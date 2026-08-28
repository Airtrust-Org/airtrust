import { describe, expect, it } from 'vitest';
import type {
  FrmsFortnightIndicator,
  FrmsOperationalSnapshotItem,
} from '@/react-app/hooks/useFrmsOperationalSnapshot';
import {
  resolveComplianceSignal,
  resolveDailyFatigueSignal,
  resolveEffectivenessSignal,
  resolveOperationalSignals,
  resolveReadinessSignal,
  type FrmsReadinessAdapter,
} from '../frmsOperationalSignals';

function fortnight(overrides: Partial<FrmsFortnightIndicator> = {}): FrmsFortnightIndicator {
  return {
    periodo_inicio: '2026-08-16',
    periodo_fim: '2026-08-31',
    dia_periodo: 12,
    total_dias_periodo: 16,
    dias_consecutivos_com_jornada: 3,
    dias_com_checkin_pendente: 0,
    dias_com_dado_estimado: 0,
    duty_time_periodo_min: 1000,
    duty_time_168h_min: 500,
    horas_voo_periodo_min: 600,
    horas_voo_168h_min: 300,
    jornadas_periodo: 8,
    apresentacoes_antes_0600: 0,
    apresentacoes_antes_0700: 1,
    menor_descanso_entre_jornadas_min: 720,
    setores_periodo: 20,
    sit_periods_estimados: 0,
    fonte_periodo: 'REAL',
    status_quinzena: 'OK',
    alertas_quinzena: [],
    limitation_notes: [],
    ...overrides,
  };
}

function item(overrides: Partial<FrmsOperationalSnapshotItem> = {}): FrmsOperationalSnapshotItem {
  return {
    empresa_id: 1,
    data_operacional: '2026-08-27',
    funcionario_id: 10,
    tripulante_id: 10,
    nome: 'Tripulante Teste',
    nome_guerra: 'Teste',
    funcao: 'PIC',
    base: 'SBJR',
    aeronave: 'AW139',
    escalado: true,
    escala_source: 'SIGVOOS',
    hora_apresentacao: '08:00',
    hora_termino: '17:00',
    horas_voo_minutos: 180,
    duracao_jornada_minutos: 540,
    teve_jornada: true,
    checkin_status: 'RECEBIDO',
    checkin_horario: '06:30',
    kss_score: 3,
    horas_sono: 7.5,
    qualidade_sono: 4,
    hora_acordar: '05:30',
    fadiga_score: 20,
    status_operacional_checkin: 'APTO',
    effectiveness_pct: 92,
    nivel_fadiga_calculado: 'BAIXO',
    fatorizacao_status: 'CALCULADA',
    sleep_data_source: 'REAL',
    wake_data_source: 'REAL',
    jornada_data_source: 'REAL',
    jornada_origem: 'SIGVOOS',
    snapshot_status: 'OK',
    fortnight_indicator: fortnight(),
    alertas: [],
    estado_operacional: 'NORMAL',
    motivos_principais: [],
    acao_recomendada_texto: 'Nenhuma ação imediata.',
    ...overrides,
  };
}

describe('resolveDailyFatigueSignal', () => {
  it('RECEBIDO → verde "Realizada"', () => {
    const s = resolveDailyFatigueSignal(item({ checkin_status: 'RECEBIDO' }));
    expect(s.tone).toBe('ok');
    expect(s.value).toBe('Realizada');
  });

  it('AUSENTE → vermelho e nunca verde', () => {
    const s = resolveDailyFatigueSignal(item({ checkin_status: 'AUSENTE' }));
    expect(s.tone).toBe('critical');
    expect(s.value).toBe('Não realizada');
  });

  it('PENDENTE → vermelho', () => {
    expect(resolveDailyFatigueSignal(item({ checkin_status: 'PENDENTE' })).tone).toBe('critical');
  });

  it('NAO_APLICAVEL → neutro', () => {
    const s = resolveDailyFatigueSignal(item({ checkin_status: 'NAO_APLICAVEL' }));
    expect(s.tone).toBe('unknown');
    expect(s.value).toBe('N/A');
  });
});

describe('resolveComplianceSignal', () => {
  it('OK → verde "Conforme"', () => {
    expect(resolveComplianceSignal(item({ fortnight_indicator: fortnight({ status_quinzena: 'OK' }) })).tone).toBe('ok');
  });

  it('ATENCAO → amarelo', () => {
    expect(
      resolveComplianceSignal(item({ fortnight_indicator: fortnight({ status_quinzena: 'ATENCAO' }) })).tone,
    ).toBe('warning');
  });

  it('CRITICO → vermelho', () => {
    expect(
      resolveComplianceSignal(item({ fortnight_indicator: fortnight({ status_quinzena: 'CRITICO' }) })).tone,
    ).toBe('critical');
  });

  it('sem indicador → não avaliado (cinza), sem 0%', () => {
    const s = resolveComplianceSignal(item({ fortnight_indicator: null }));
    expect(s.tone).toBe('unknown');
    expect(s.value).toBe('Dados incompletos');
    expect(s.value).not.toContain('0%');
  });
});

describe('resolveEffectivenessSignal', () => {
  it('valor confiável normal → verde com percentual pt-BR', () => {
    const s = resolveEffectivenessSignal(item({ effectiveness_pct: 84.2 }));
    expect(s.tone).toBe('ok');
    expect(s.value).toBe('84,2%');
  });

  it('alerta EFETIVIDADE_BAIXA → atenção', () => {
    const s = resolveEffectivenessSignal(
      item({ effectiveness_pct: 62.4, alertas: ['EFETIVIDADE_BAIXA'], estado_operacional: 'ATENCAO' }),
    );
    expect(s.tone).toBe('warning');
  });

  it('estado crítico → vermelho', () => {
    const s = resolveEffectivenessSignal(
      item({ effectiveness_pct: 40, estado_operacional: 'CRITICO_VIOLACAO' }),
    );
    expect(s.tone).toBe('critical');
  });

  it('não calculável → cinza "Não calculada", nunca 0%', () => {
    const s = resolveEffectivenessSignal(item({ fatorizacao_status: 'AUSENTE', effectiveness_pct: null }));
    expect(s.tone).toBe('unknown');
    expect(s.value).toBe('Não calculada');
    expect(s.value).not.toContain('0%');
  });
});

describe('resolveReadinessSignal', () => {
  it('sem adapter/contrato → "Não avaliado" cinza', () => {
    const s = resolveReadinessSignal(item());
    expect(s.tone).toBe('unknown');
    expect(s.value).toBe('Não avaliado');
  });

  it('mapeia todas as classificações da frente PR #68', () => {
    const adapterFor =
      (c: 'preserved' | 'attention' | 'operational_review' | 'baseline_building'): FrmsReadinessAdapter =>
      () =>
        c;

    expect(resolveReadinessSignal(item(), adapterFor('preserved'))).toMatchObject({
      tone: 'ok',
      value: 'Preservada',
    });
    expect(resolveReadinessSignal(item(), adapterFor('attention'))).toMatchObject({
      tone: 'warning',
      value: 'Atenção',
    });
    expect(resolveReadinessSignal(item(), adapterFor('operational_review'))).toMatchObject({
      tone: 'critical',
      value: 'Revisão operacional',
    });
    expect(resolveReadinessSignal(item(), adapterFor('baseline_building'))).toMatchObject({
      tone: 'unknown',
      value: 'Baseline em formação',
    });
  });
});

describe('resolveOperationalSignals', () => {
  it('retorna sempre os quatro sinais na ordem canônica', () => {
    const signals = resolveOperationalSignals(item());
    expect(signals.map((s) => s.key)).toEqual([
      'daily-fatigue',
      'compliance',
      'effectiveness',
      'readiness',
    ]);
  });
});
