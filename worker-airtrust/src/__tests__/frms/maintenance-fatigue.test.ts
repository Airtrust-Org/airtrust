import { describe, expect, it } from 'vitest';
import { assessMaintenanceFatigue } from '../../lib/frms/maintenance-fatigue';

describe('assessMaintenanceFatigue', () => {
  it('mantém condição normal com sono e KSS preservados', () => {
    const result = assessMaintenanceFatigue({ sleepHours24h: 8, sleepQuality: 4, kssScore: 3, fitForDuty: true });
    expect(result.riskLevel).toBe('normal');
    expect(result.operationalStatus).toBe('APTO');
    expect(result.requiresOperationalReview).toBe(0);
  });

  it('sinaliza atenção por sono curto, KSS 7 ou qualidade baixa', () => {
    expect(assessMaintenanceFatigue({ sleepHours24h: 5.5, sleepQuality: 4, kssScore: 3, fitForDuty: true }).riskLevel).toBe('attention');
    expect(assessMaintenanceFatigue({ sleepHours24h: 8, sleepQuality: 4, kssScore: 7, fitForDuty: true }).riskLevel).toBe('attention');
    expect(assessMaintenanceFatigue({ sleepHours24h: 8, sleepQuality: 2, kssScore: 3, fitForDuty: true }).riskLevel).toBe('attention');
  });

  it('sinaliza crítico por menos de 4 h de sono ou KSS 8–9', () => {
    expect(assessMaintenanceFatigue({ sleepHours24h: 3.5, sleepQuality: 3, kssScore: 3, fitForDuty: true }).riskLevel).toBe('critical');
    expect(assessMaintenanceFatigue({ sleepHours24h: 8, sleepQuality: 4, kssScore: 8, fitForDuty: true }).riskLevel).toBe('critical');
  });

  it('auto-relato não seguro prevalece sobre os demais sinais', () => {
    const result = assessMaintenanceFatigue({ sleepHours24h: 9, sleepQuality: 5, kssScore: 1, fitForDuty: false });
    expect(result.riskLevel).toBe('unfit_for_duty');
    expect(result.operationalStatus).toBe('NAO_APTO');
    expect(result.requiresOperationalReview).toBe(1);
  });
});
