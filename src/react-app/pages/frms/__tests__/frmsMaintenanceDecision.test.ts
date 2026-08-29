import { describe, expect, it } from 'vitest';
import type { FrmsMaintenanceTeamItem } from '@/react-app/hooks/useFrmsOperationalAccess';
import { classifyMaintenanceItem, readinessLabel } from '../frmsMaintenanceDecision';

function item(overrides: Partial<FrmsMaintenanceTeamItem> = {}): FrmsMaintenanceTeamItem {
  return {
    funcionario_id: 1,
    funcionario_nome: 'Mecânico Teste',
    cargo: 'Mecânico',
    funcao: 'MECANICO',
    setor_id: 2,
    setor_nome: 'Manutenção',
    checkin_id: 'checkin-1',
    hora_checkin: '06:00',
    horas_sono: 7.5,
    qualidade_sono: 4,
    kss_score: 3,
    score_fadiga: 20,
    nivel_fadiga: 'VERDE',
    status_operacional: 'APTO',
    computed_risk_level: 'normal',
    requires_operational_review: 0,
    readiness_id: 'readiness-1',
    readiness_classification: 'preserved',
    baseline_sessions: 6,
    baseline_ready: 1,
    median_rt_delta_pct: 0,
    lapse_rate_delta: 0,
    readiness_created_at: '2026-08-29 06:03:00',
    ...overrides,
  };
}

describe('classifyMaintenanceItem', () => {
  it('prioriza risco crítico e revisão operacional objetiva', () => {
    expect(classifyMaintenanceItem(item({ computed_risk_level: 'critical' }))).toBe('CRITICAL');
    expect(classifyMaintenanceItem(item({ readiness_classification: 'operational_review' }))).toBe('CRITICAL');
  });

  it('classifica sinais intermediários como atenção', () => {
    expect(classifyMaintenanceItem(item({ computed_risk_level: 'attention' }))).toBe('ATTENTION');
    expect(classifyMaintenanceItem(item({ readiness_classification: 'attention' }))).toBe('ATTENTION');
    expect(classifyMaintenanceItem(item({ requires_operational_review: 1 }))).toBe('ATTENTION');
  });

  it('não trata ausência de check-in ou PVT como normal', () => {
    expect(classifyMaintenanceItem(item({ checkin_id: null }))).toBe('PENDING');
    expect(classifyMaintenanceItem(item({ readiness_id: null }))).toBe('PENDING');
  });

  it('aceita baseline em formação como teste realizado, sem criar alerta artificial', () => {
    expect(
      classifyMaintenanceItem(
        item({ readiness_classification: 'baseline_building', baseline_ready: 0, baseline_sessions: 2 }),
      ),
    ).toBe('NORMAL');
    expect(readinessLabel('baseline_building')).toBe('Baseline em formação');
  });
});
