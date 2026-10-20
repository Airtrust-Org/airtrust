import { describe, expect, it } from 'vitest';
import {
  BombeirosScenarioSchema, assessBombeirosSyntheticScenario,
} from '../../lib/frms/bombeiros-scenario-method';

const complete = {
  mode: 'SYNTHETIC' as const,
  mission_type: 'RESGATE' as const,
  duty_period: 'DIURNO' as const,
  standby_activation: false,
  critical_mission: false,
  sleep_hours_24h: 8,
  sleep_fragmented: false,
  kss_reported: 2,
  pvt_60s_completed: true,
  self_declared_unfit: false,
};
describe('BOA tender method — evidence without false fitness score', () => {
  it('returns required human review even with apparently normal signals', () => {
    const result = assessBombeirosSyntheticScenario(complete);
    expect(result.status).toBe('HUMAN_REVIEW_REQUIRED');
    expect(result.dispatch_permission).toBe('NOT_GRANTED');
    expect(result.persisted).toBe(false);
    expect(result.evidence).toHaveLength(9);
    expect(JSON.stringify(result)).not.toMatch(/HELICOPTER_OFFSHORE|Costa do Sol|score_fadiga|apto_para_voo/i);
  });
  it('retains missing KSS, sleep and PVT as missing, never as normal', () => {
    const result = assessBombeirosSyntheticScenario({
      ...complete, sleep_hours_24h: null, kss_reported: null, pvt_60s_completed: null,
      duty_period: 'DESCONHECIDO',
    });
    expect(result.status).toBe('INCOMPLETE_EVIDENCE');
    expect(result.evidence.filter(item => item.state === 'MISSING').map(item => item.factor))
      .toEqual(expect.arrayContaining(['SLEEP_24H', 'KSS_SUBJECTIVE_SLEEPINESS', 'PVT_60S_ADAPTED', 'DUTY_PERIOD']));
    expect(result.dispatch_permission).toBe('NOT_GRANTED');
  });
  it('escalates self-declared unfit for human intervention', () => {
    const result = assessBombeirosSyntheticScenario({ ...complete, self_declared_unfit: true });
    expect(result.actions.join(' ')).toMatch(/não aptidão.*avaliação humana/i);
    expect(result.dispatch_permission).toBe('NOT_GRANTED');
  });
  it('provides mission-specific review for night rescue and standby activation', () => {
    const result = assessBombeirosSyntheticScenario({
      ...complete, duty_period: 'NOTURNO', standby_activation: true, critical_mission: true,
      sleep_fragmented: true,
    });
    expect(result.actions.join(' ')).toMatch(/sequência de missões.*repouso/i);
    expect(result.status).toBe('HUMAN_REVIEW_REQUIRED');
  });
  it('rejects identifiers, extra personal fields, invalid KSS and production mode', () => {
    expect(BombeirosScenarioSchema.safeParse({ ...complete, empresa_id: 6 }).success).toBe(false);
    expect(BombeirosScenarioSchema.safeParse({ ...complete, funcionario_id: 100 }).success).toBe(false);
    expect(BombeirosScenarioSchema.safeParse({ ...complete, kss_reported: 10 }).success).toBe(false);
    expect(BombeirosScenarioSchema.safeParse({ ...complete, mode: 'REAL' }).success).toBe(false);
  });
});
