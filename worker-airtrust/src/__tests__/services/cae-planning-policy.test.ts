import { describe, expect, it } from 'vitest';
import {
  completionProximityPenalty,
  evaluateCrewPairing,
  evaluateRosterEligibility,
  isInsidePlanningHorizon,
  planningQueueStartDate,
  resolveSimulatorPlanningConfig,
} from './../../services/cae-planning-policy';

describe('CAE planning policy V3', () => {
  it('usa 90 dias apenas como horizonte de planejamento', () => {
    const config = resolveSimulatorPlanningConfig(null);
    expect(planningQueueStartDate('2026-11-30', config)).toBe('2026-09-01');
    expect(isInsidePlanningHorizon({ reference_date: '2026-08-31', expiry_date: '2026-11-30', config })).toBe(false);
    expect(isInsidePlanningHorizon({ reference_date: '2026-09-01', expiry_date: '2026-11-30', config })).toBe(true);
  });

  it('busca política de quinzena configurável sem fixar quinzena por funcionário', () => {
    expect(evaluateRosterEligibility('FOLGA', 'FOLGA').eligible).toBe(true);
    expect(evaluateRosterEligibility('FOLGA', 'TRABALHO').eligible).toBe(false);
    expect(evaluateRosterEligibility('TRABALHO', 'TRABALHO').eligible).toBe(true);
    expect(evaluateRosterEligibility('AMBAS', 'FOLGA').eligible).toBe(true);
    expect(evaluateRosterEligibility('AMBAS', 'TRABALHO').eligible).toBe(true);
    expect(evaluateRosterEligibility('AMBAS', 'INDISPONIVEL').eligible).toBe(false);
    expect(evaluateRosterEligibility('AMBAS', 'DESCONHECIDO').eligible).toBe(false);
  });

  it('prefere sessão normal quando ambos executam o mesmo modelo', () => {
    const config = resolveSimulatorPlanningConfig(null);
    const result = evaluateCrewPairing({
      same_equipment: true,
      same_training: true,
      same_session_model: true,
      canonical_shared_compatibility: true,
      config,
    });
    expect(result.eligible).toBe(true);
    expect(result.mode).toBe('NORMAL');
    expect(result.preference_penalty).toBe(0);
  });

  it('permite sessão compartilhada para sessões diferentes quando a regra canônica permitir', () => {
    const config = resolveSimulatorPlanningConfig(null);
    const result = evaluateCrewPairing({
      same_equipment: true,
      same_training: false,
      same_session_model: false,
      canonical_shared_compatibility: true,
      config,
    });
    expect(result.eligible).toBe(true);
    expect(result.mode).toBe('COMPARTILHADA');
    expect(result.preference_penalty).toBeGreaterThan(0);
  });

  it('não inventa compatibilidade de sessão compartilhada', () => {
    const config = resolveSimulatorPlanningConfig(null);
    const result = evaluateCrewPairing({
      same_equipment: true,
      same_training: false,
      same_session_model: false,
      canonical_shared_compatibility: false,
      config,
    });
    expect(result.eligible).toBe(false);
  });

  it('prefere conclusão mais próxima do vencimento', () => {
    const cedo = completionProximityPenalty({ completion_date: '2026-09-30', expiry_date: '2026-11-30' });
    const perto = completionProximityPenalty({ completion_date: '2026-11-20', expiry_date: '2026-11-30' });
    expect(perto).toBeLessThan(cedo);
    expect(completionProximityPenalty({ completion_date: '2026-12-01', expiry_date: '2026-11-30' })).toBe(Number.POSITIVE_INFINITY);
  });
});
