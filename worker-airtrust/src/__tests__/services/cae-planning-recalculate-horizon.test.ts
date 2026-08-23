import { describe, expect, it } from 'vitest';
import type { CaeAvailabilitySlotV1 } from '../../services/cae-availability';
import { evaluatePlanningNeedWithCae } from '../../services/cae-planning-matcher';
import { resolveSimulatorPlanningConfig } from '../../services/cae-planning-policy';

function slot(date: string): CaeAvailabilitySlotV1 {
  return {
    equipment: 'AW139',
    date,
    start_time: '08:00',
    end_date: date,
    end_time: '10:00',
    duration_minutes: 120,
    state: 'OFFERED',
    confidence: 1,
  };
}

describe('recalculate flow: 90 days as eligibility only', () => {
  const config = resolveSimulatorPlanningConfig({
    planejamento_simulador_antecedencia_dias: 90,
    planejamento_simulador_regra_quinzena: 'FOLGA',
    planejamento_simulador_preferencia_sessoes_por_dia: 2,
    planejamento_simulador_preferencia_minutos_por_dia: 240,
    planejamento_simulador_permitir_quebra_preferencia: 1,
    planejamento_simulador_permitir_sessao_compartilhada: 1,
    planejamento_simulador_preferir_mesmo_treinamento: 1,
    planejamento_simulador_preferir_mesma_sessao: 1,
    planejamento_simulador_aprovacao_obrigatoria: 1,
  });

  it('entra no planejamento em 2026-09-01 e escolhe 2026-11-20, sem usar 90 dias como janela', () => {
    const result = evaluatePlanningNeedWithCae({
      reference_date: '2026-09-01',
      expiry_date: '2026-11-30',
      config,
      equipment: 'AW139',
      session_durations_minutes: [120],
      slots: [slot('2026-09-15'), slot('2026-11-20')],
    });

    expect(config.planning_horizon_days).toBe(90);
    expect(result.eligible).toBe(true);
    expect(result.match?.status).toBe('MATCHED');
    expect(result.match?.selected_slots[0].date).toBe('2026-11-20');
    expect(result.match?.selected_slots[0].date).not.toBe('2026-09-15');
  });

  it('não entra no planejamento se a data de referência for anterior ao início do horizonte', () => {
    const result = evaluatePlanningNeedWithCae({
      reference_date: '2026-08-31',
      expiry_date: '2026-11-30',
      config,
      equipment: 'AW139',
      session_durations_minutes: [120],
      slots: [slot('2026-09-15'), slot('2026-11-20')],
    });
    expect(result.eligible).toBe(false);
    expect(result.match).toBeNull();
  });
});
