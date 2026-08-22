import { describe, expect, it } from 'vitest';
import { resolveSimulatorPlanningConfig } from './../../services/cae-planning-policy';
import { calculateCaeAllocationScore } from './../../services/cae-planning-score';

const config = resolveSimulatorPlanningConfig({
  planejamento_simulador_antecedencia_dias: 90,
  planejamento_simulador_regra_quinzena: 'AMBAS',
  planejamento_simulador_preferencia_sessoes_por_dia: 2,
  planejamento_simulador_preferencia_minutos_por_dia: 240,
  planejamento_simulador_permitir_quebra_preferencia: 1,
  planejamento_simulador_permitir_sessao_compartilhada: 1,
  planejamento_simulador_preferir_mesmo_treinamento: 1,
  planejamento_simulador_preferir_mesma_sessao: 1,
  planejamento_simulador_aprovacao_obrigatoria: 1,
});

describe('CAE allocation score V3', () => {
  it('prefere solução equivalente mais perto do vencimento', () => {
    const early = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-09-10', start_time: '08:00', duration_minutes: 120 },
        { session_index: 1, date: '2026-09-10', start_time: '10:00', duration_minutes: 120 },
      ],
    });
    const late = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-11-20', start_time: '08:00', duration_minutes: 120 },
        { session_index: 1, date: '2026-11-20', start_time: '10:00', duration_minutes: 120 },
      ],
    });
    expect(late.total).toBeLessThan(early.total);
  });

  it('prefere duas sessões e 240 minutos no mesmo dia quando aplicável', () => {
    const grouped = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-11-20', start_time: '08:00', duration_minutes: 120 },
        { session_index: 1, date: '2026-11-20', start_time: '10:00', duration_minutes: 120 },
      ],
    });
    const spread = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-11-20', start_time: '08:00', duration_minutes: 120 },
        { session_index: 1, date: '2026-11-22', start_time: '08:00', duration_minutes: 120 },
      ],
    });
    expect(grouped.total).toBeLessThan(spread.total);
  });

  it('não elimina sessão compartilhada; apenas incorpora sua penalidade de preferência', () => {
    const normal = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-11-20', start_time: '08:00', duration_minutes: 120, pairing_preference_penalty: 0 },
      ],
    });
    const shared = calculateCaeAllocationScore({
      expiry_date: '2026-11-30',
      config,
      assignments: [
        { session_index: 0, date: '2026-11-20', start_time: '08:00', duration_minutes: 120, pairing_preference_penalty: 400 },
      ],
    });
    expect(shared.total).toBeGreaterThan(normal.total);
    expect(Number.isFinite(shared.total)).toBe(true);
  });
});
