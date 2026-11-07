import { describe, expect, it } from 'vitest';
import {
  evaluateRegulatoryCompliance,
  type RegulatoryComplianceInput,
  type RollingFlightCoverageEvidence,
} from '../../lib/frms/regulatory-compliance';

const limites = { FDP_MAXIMO_HORAS: 11, HV_DIARIA_HORAS: 8, HV_MES_HORAS: 90, HV_28_DIAS_HORAS: 93, HV_365_DIAS_HORAS: 930 };
const rolling = {
  data_referencia: '2026-09-26', funcionario_id: 7, hv_dia_min: 120, hv_mes_calendario_min: 600,
  hv_28_dias_min: 600, hv_365_dias_min: 5000, hv_ano_calendario_min: 5000,
  repouso_anterior_min: 900, repouso_suficiente: 1,
};
const work = { monthWorkToDateMin: 3000, rolling7dWorkMin: 1800, rolling14dWorkMin: 3000, completeThroughDate: true, incompleteReasons: [] as string[] };
const coverage: RollingFlightCoverageEvidence = {
  sourceVerified: true,
  windows: {
    month: { expectedDays: 8, confirmedDays: 8 }, year: { expectedDays: 70, confirmedDays: 70 },
    days28: { expectedDays: 8, confirmedDays: 8 }, days365: { expectedDays: 70, confirmedDays: 70 },
  },
};
const base = (over: Partial<RegulatoryComplianceInput> = {}): RegulatoryComplianceInput => ({
  empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
  journeyDurationMin: 600, rolling, rollingCoverage: coverage, work, limites, ...over,
});

describe('regulatory compliance — adversarial inputs', () => {
  it('baseline with complete evidence is COMPLIANT', () => {
    expect(evaluateRegulatoryCompliance(base()).status).toBe('COMPLIANT');
  });

  it.each([NaN, -1, Infinity])('invalid journey duration %s never yields COMPLIANT', (v) => {
    const r = evaluateRegulatoryCompliance(base({ journeyDurationMin: v as number }));
    expect(r.status).not.toBe('COMPLIANT');
  });

  it.each([NaN, 0, -3])('invalid profile FDP limit %s never yields COMPLIANT', (v) => {
    const r = evaluateRegulatoryCompliance(base({ limites: { ...limites, FDP_MAXIMO_HORAS: v } }));
    expect(r.status).not.toBe('COMPLIANT');
  });

  it('invalid month work total never yields COMPLIANT', () => {
    const r = evaluateRegulatoryCompliance(base({ work: { ...work, monthWorkToDateMin: NaN } }));
    expect(r.status).not.toBe('COMPLIANT');
  });

  it('invalid rolling flight value never yields COMPLIANT', () => {
    const r = evaluateRegulatoryCompliance(base({ rolling: { ...rolling, hv_dia_min: NaN } }));
    expect(r.status).not.toBe('COMPLIANT');
  });

  it('exact limits are compliant, one minute above is a violation', () => {
    const at = evaluateRegulatoryCompliance(base({ rolling: { ...rolling, hv_dia_min: 480, hv_mes_calendario_min: 5400, hv_ano_calendario_min: 55800 }, work: { ...work, monthWorkToDateMin: 176 * 60 } }));
    expect(at.status).toBe('COMPLIANT');
    const above = evaluateRegulatoryCompliance(base({ rolling: { ...rolling, hv_dia_min: 481, hv_mes_calendario_min: 5401, hv_ano_calendario_min: 55801 }, work: { ...work, monthWorkToDateMin: 176 * 60 + 1 } }));
    expect(above.status).toBe('VIOLATION');
    expect(above.violations.map((v) => v.code).sort()).toEqual(
      ['LAW_HELI_FLIGHT_DAY_8H', 'LAW_HELI_FLIGHT_MONTH_90H', 'LAW_HELI_FLIGHT_YEAR_930H', 'WORK_MONTH_176H'].sort());
  });

  it('a proven violation survives unrelated unknown evidence', () => {
    const r = evaluateRegulatoryCompliance(base({
      rollingCoverage: null, rolling: { ...rolling, hv_dia_min: 500, hv_365_dias_min: null as unknown as number },
      work: { ...work, completeThroughDate: false, incompleteReasons: ['X'] },
    }));
    expect(r.status).toBe('VIOLATION');
    expect(r.unknownReasons.length).toBeGreaterThan(0);
  });

  it('non-helicopter profile is never COMPLIANT by default', () => {
    expect(evaluateRegulatoryCompliance(base({ profileCode: 'GENERIC' })).status).toBe('UNKNOWN');
  });
});
