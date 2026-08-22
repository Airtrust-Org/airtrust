import { describe, expect, it } from 'vitest';
import { resolveSimulatorPlanningConfig } from './../../services/cae-planning-policy';
import {
  revalidateSimulatorPlanningProposal,
  type SimulatorPlanningLiveState,
  type SimulatorPlanningSourceSnapshot,
} from './../../services/cae-planning-revalidation';

function baseSnapshot(): SimulatorPlanningSourceSnapshot {
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
  return {
    generated_at: '2026-08-22T20:00:00Z',
    config,
    canonical_session_fingerprint: 'sessions:v1',
    pairing_fingerprint: 'pairing:v1',
    participants: [{
      employee_id: 10,
      employee_active: true,
      equipment: 'AW139',
      qualification_history_id: 100,
      qualification_expiry_date: '2026-11-30',
      training_id: 200,
      session_model_ids: [1, 2, 3],
      roster_by_date: { '2026-11-20': 'FOLGA' },
    }],
    cae_slots: [{
      slot_key: 'AW139|2026-11-20|08:00|2026-11-20|12:00',
      state: 'OFFERED',
      equipment: 'AW139',
      date: '2026-11-20',
      start_time: '08:00',
      end_time: '12:00',
    }],
  };
}

function liveFrom(snapshot: SimulatorPlanningSourceSnapshot): SimulatorPlanningLiveState {
  return {
    config: snapshot.config,
    participants: JSON.parse(JSON.stringify(snapshot.participants)),
    cae_slots: JSON.parse(JSON.stringify(snapshot.cae_slots)),
    canonical_session_fingerprint: snapshot.canonical_session_fingerprint,
    pairing_fingerprint: snapshot.pairing_fingerprint,
  };
}

describe('CAE planning approval revalidation', () => {
  it('aprova quando nada material mudou', () => {
    const snapshot = baseSnapshot();
    expect(revalidateSimulatorPlanningProposal(snapshot, liveFrom(snapshot)).ok).toBe(true);
  });

  it('bloqueia se o tripulante mudou para quinzena incompatível', () => {
    const snapshot = baseSnapshot();
    const live = liveFrom(snapshot);
    live.participants[0].roster_by_date['2026-11-20'] = 'TRABALHO';
    const result = revalidateSimulatorPlanningProposal(snapshot, live);
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'ROSTER_POLICY_NO_LONGER_SATISFIED')).toBe(true);
  });

  it('não bloqueia mudança de folga para trabalho quando política é AMBAS, mas avisa', () => {
    const snapshot = baseSnapshot();
    snapshot.config = resolveSimulatorPlanningConfig({
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
    const live = liveFrom(snapshot);
    live.participants[0].roster_by_date['2026-11-20'] = 'TRABALHO';
    const result = revalidateSimulatorPlanningProposal(snapshot, live);
    expect(result.ok).toBe(true);
    expect(result.issues.some((issue) => issue.severity === 'WARN')).toBe(true);
  });

  it('bloqueia se qualificação, currículo ou disponibilidade CAE mudarem', () => {
    const snapshot = baseSnapshot();
    const live = liveFrom(snapshot);
    live.participants[0].qualification_expiry_date = '2026-12-31';
    live.canonical_session_fingerprint = 'sessions:v2';
    live.cae_slots[0].state = 'UNKNOWN';
    const result = revalidateSimulatorPlanningProposal(snapshot, live);
    expect(result.ok).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'QUALIFICATION_STATE_CHANGED',
      'SESSION_MODELS_CHANGED',
      'CAE_SLOT_NOT_AVAILABLE',
    ]));
  });
});
