import { describe, expect, it } from 'vitest';
import { evaluateRegulatoryCompliance } from '../../lib/frms/regulatory-compliance';

const limites = {
  FDP_MAXIMO_HORAS: 11,
  HV_DIARIA_HORAS: 8,
  HV_MES_HORAS: 90,
  HV_28_DIAS_HORAS: 93,
  HV_365_DIAS_HORAS: 930,
};

const rolling = {
  data_referencia: '2026-09-26',
  funcionario_id: 7,
  hv_dia_min: 120,
  hv_mes_calendario_min: 600,
  hv_28_dias_min: 600,
  hv_365_dias_min: 5000,
  hv_ano_calendario_min: 5000,
  repouso_anterior_min: 900,
  repouso_suficiente: 1,
};

const work = {
  monthWorkToDateMin: 3000,
  rolling7dWorkMin: 1800,
  rolling14dWorkMin: 3000,
  completeThroughDate: true,
  incompleteReasons: [],
};
describe('FRMS regulatory compliance evaluator', () => {
  it('does not flag values exactly at the legal limit', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6,
      profileCode: 'HELICOPTER_OFFSHORE',
      rbacBcApplicable: false,
      journeyDurationMin: 11 * 60,
      rolling: {
        ...rolling,
        hv_dia_min: 8 * 60,
        hv_mes_calendario_min: 90 * 60,
        hv_ano_calendario_min: 930 * 60,
      },
      work: { ...work, monthWorkToDateMin: 176 * 60 },
      limites,
    });
    expect(result.status).toBe('COMPLIANT');
    expect(result.violations).toHaveLength(0);
  });

  it('flags 8h/day and 90h/month as LAW, not ACT', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0,
      rolling: { ...rolling, hv_dia_min: 481, hv_mes_calendario_min: 5401 },
      work, limites,
    });
    expect(result.status).toBe('VIOLATION');
    expect(result.violations.filter((v) => v.code.startsWith('LAW_HELI_FLIGHT'))
      .every((v) => v.source === 'LAW')).toBe(true);
  });

  it('does not apply B/C rolling limits without documented B/C applicability', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6,
      profileCode: 'HELICOPTER_OFFSHORE',
      rbacBcApplicable: false,
      journeyDurationMin: 0,
      rolling: { ...rolling, hv_28_dias_min: 94 * 60, hv_365_dias_min: 931 * 60 },
      work: { ...work, rolling7dWorkMin: 61 * 60, rolling14dWorkMin: 101 * 60 },
      limites,
    });
    expect(result.violations.some((v) => v.code.includes('RBAC117_BC'))).toBe(false);
  });

  it('applies B/C rolling limits when the governed profile documents B/C', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 42,
      profileCode: 'HELICOPTER_OFFSHORE',
      rbacBcApplicable: true,
      journeyDurationMin: 0,
      rolling: { ...rolling, hv_28_dias_min: 94 * 60, hv_365_dias_min: 931 * 60 },
      work: { ...work, rolling7dWorkMin: 61 * 60, rolling14dWorkMin: 101 * 60 },
      limites,
    });
    expect(result.status).toBe('VIOLATION');
    expect(result.violations.map((v) => v.code)).toEqual(expect.arrayContaining([
      'RBAC117_BC_FLIGHT_28D_93H', 'RBAC117_BC_FLIGHT_365D_930H',
      'RBAC117_BC_WORK_7D_60H', 'RBAC117_BC_WORK_14D_100H',
    ]));
  });

  it('applies the 176h legal/ACT monthly work limit to Costa do Sol when B/C is absent', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0, rolling,
      work: { ...work, monthWorkToDateMin: 176 * 60 + 1 }, limites,
    });
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'WORK_MONTH_176H', source: 'LAW' }),
    ]));
  });

  it('fails closed when work or rest evidence is incomplete', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0,
      rolling: { ...rolling, repouso_anterior_min: -1, repouso_suficiente: 0 },
      work: { ...work, completeThroughDate: false, incompleteReasons: ['ACTIVITY_INTERVAL_MISSING'] },
      limites,
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.unknownReasons).toEqual(expect.arrayContaining([
      'REST_EVIDENCE_UNKNOWN', 'ACTIVITY_INTERVAL_MISSING',
    ]));
  });

  it('does not relabel governed values as LAW when profile parameters are stricter', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0,
      rolling: { ...rolling, hv_dia_min: 7 * 60 + 1, hv_mes_calendario_min: 80 * 60 + 1 },
      work,
      limites: { ...limites, HV_DIARIA_HORAS: 7, HV_MES_HORAS: 80 },
    });
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'PROFILE_FLIGHT_DAY_LIMIT', source: 'PROFILE', limitMin: 7 * 60 }),
      expect.objectContaining({ code: 'PROFILE_FLIGHT_MONTH_LIMIT', source: 'PROFILE', limitMin: 80 * 60 }),
    ]));
    expect(result.violations.some((v) => v.code === 'LAW_HELI_FLIGHT_DAY_8H')).toBe(false);
    expect(result.violations.some((v) => v.code === 'LAW_HELI_FLIGHT_MONTH_90H')).toBe(false);
  });

});


describe('Costa do Sol ACT mission compliance in canonical evaluator', () => {
  it('flags mission day 22 and effective-work day 18 as ACT violations', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true,
      mission: { inMission: true, missionDay: 22, effectiveWorkDaysAtOperation: 18, effectiveWorkEvidenceComplete: true, incompleteReasons: [] },
      journeyDurationMin: 0, rolling, work, limites,
    });
    expect(result.violations.map((v) => v.code)).toEqual(expect.arrayContaining([
      'ACT_CDS_MISSION_21D', 'ACT_CDS_EFFECTIVE_17D',
    ]));
  });

  it('fails closed when effective days at the operation are incomplete', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true,
      mission: { inMission: true, missionDay: 10, effectiveWorkDaysAtOperation: 9, effectiveWorkEvidenceComplete: false, incompleteReasons: ['ACTIVITY_INTERVAL_MISSING'] },
      journeyDurationMin: 0, rolling, work, limites,
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.unknownReasons).toEqual(expect.arrayContaining([
      'ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE', 'ACTIVITY_INTERVAL_MISSING',
    ]));
  });
});
