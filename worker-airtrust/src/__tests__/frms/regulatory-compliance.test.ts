import { describe, expect, it } from 'vitest';
import { evaluateRegulatoryCompliance, hasCompleteRollingFlightCoverage, sanitizeRollingRegulatoryEvidence, type RollingFlightCoverageEvidence } from '../../lib/frms/regulatory-compliance';
import { evaluateLawArt42Madrugadas } from '../../lib/frms/law-art42-madrugadas';

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
const completeCoverage: RollingFlightCoverageEvidence = {
  sourceVerified: true,
  windows: {
    month: { expectedDays: 8, confirmedDays: 8 },
    year: { expectedDays: 70, confirmedDays: 70 },
    days28: { expectedDays: 8, confirmedDays: 8 },
    days365: { expectedDays: 70, confirmedDays: 70 },
  },
};

describe('FRMS regulatory compliance evaluator', () => {
  it('does not mistake numeric flight totals without source-backed day coverage for compliance', () => {
    const input = {
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0, rolling, work, limites,
    };
    const unverified = evaluateRegulatoryCompliance(input);
    expect(unverified.status).toBe('UNKNOWN');
    expect(unverified.unknownReasons).toContain('ROLLING_FLIGHT_COVERAGE_INCOMPLETE');
    expect(unverified.violations).toEqual([]);

    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, sourceVerified: false })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, windows: { ...completeCoverage.windows, days28: { expectedDays: 8, confirmedDays: 7 } } })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, windows: { ...completeCoverage.windows, month: { expectedDays: 8, confirmedDays: 9 } } })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, windows: { ...completeCoverage.windows, month: { expectedDays: 0, confirmedDays: 0 } } })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, windows: { ...completeCoverage.windows, days365: { expectedDays: 0, confirmedDays: 0 } } })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({
      sourceVerified: true,
      windows: {
        month: { expectedDays: 0, confirmedDays: 0 },
        year: { expectedDays: 0, confirmedDays: 0 },
        days28: { expectedDays: 0, confirmedDays: 0 },
        days365: { expectedDays: 0, confirmedDays: 0 },
      },
    })).toBe(false);
    expect(hasCompleteRollingFlightCoverage({ ...completeCoverage, windows: { ...completeCoverage.windows, month: { expectedDays: 1.5, confirmedDays: 1.5 } } })).toBe(false);
    expect(hasCompleteRollingFlightCoverage(completeCoverage)).toBe(true);
    const complete = evaluateRegulatoryCompliance({ ...input, rollingCoverage: completeCoverage });
    expect(complete.status).toBe('COMPLIANT');
  });

  it('keeps proven flight-hour limit violations even when import coverage is unknown', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 0, rolling: { ...rolling, hv_dia_min: 481 }, work, limites,
    });
    expect(result.status).toBe('VIOLATION');
    expect(result.violations.map((v) => v.code)).toContain('LAW_HELI_FLIGHT_DAY_8H');
    expect(result.unknownReasons).toContain('ROLLING_FLIGHT_COVERAGE_INCOMPLETE');
  });

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
      rollingCoverage: completeCoverage,
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

  it('blocks a new duty until the ACT post-mission off-days are completed', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true,
      mission: {
        inMission: false, missionDay: null, effectiveWorkDaysAtOperation: 17,
        effectiveWorkEvidenceComplete: true, incompleteReasons: [],
        postMissionRequiredOffDays: 15, postMissionCompletedOffDays: 14,
        postMissionDutyOnDate: true, postMissionRestEvidenceComplete: true,
      },
      journeyDurationMin: 0, rolling, work, limites,
    });
    expect(result.status).toBe('VIOLATION');
    expect(result.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'ACT_CDS_POST_MISSION_REST', source: 'LAW', limitMin: 15 * 24 * 60 }),
    ]));
  });

  it('allows duty after the ACT post-mission off-days are completed', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true,
      mission: {
        inMission: false, missionDay: null, effectiveWorkDaysAtOperation: 17,
        effectiveWorkEvidenceComplete: true, incompleteReasons: [],
        postMissionRequiredOffDays: 15, postMissionCompletedOffDays: 15,
        postMissionDutyOnDate: true, postMissionRestEvidenceComplete: true,
      },
      journeyDurationMin: 0, rolling, work, limites,
    });
    expect(result.violations.some((v) => v.code === 'ACT_CDS_POST_MISSION_REST')).toBe(false);
  });

  it('fails closed when a duty falls in the post-mission window without complete work evidence', () => {
    const result = evaluateRegulatoryCompliance({
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true,
      mission: {
        inMission: false, missionDay: null, effectiveWorkDaysAtOperation: null,
        effectiveWorkEvidenceComplete: false, incompleteReasons: ['ACTIVITY_INTERVAL_MISSING'],
        postMissionRequiredOffDays: null, postMissionCompletedOffDays: 3,
        postMissionDutyOnDate: true, postMissionRestEvidenceComplete: false,
      },
      journeyDurationMin: 0, rolling, work, limites,
    });
    expect(result.status).toBe('UNKNOWN');
    expect(result.unknownReasons).toEqual(expect.arrayContaining([
      'ACT_CDS_POST_MISSION_REST_EVIDENCE_INCOMPLETE', 'ACTIVITY_INTERVAL_MISSING',
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

  describe('Lei 13.475 art. 42 (madrugadas)', () => {
    const thirdEarlyStart = evaluateLawArt42Madrugadas('2026-09-26', [
      { data: '2026-09-24', hora_apresentacao: '05:30', hora_termino: '14:00' },
      { data: '2026-09-25', hora_apresentacao: '05:30', hora_termino: '14:00' },
      { data: '2026-09-26', hora_apresentacao: '05:30', hora_termino: '14:00' },
    ]);
    const base = {
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      journeyDurationMin: 8 * 60, rolling, rollingCoverage: completeCoverage, work, limites,
    };

    it('sem ativação no perfil, expõe o achado como pendente de validação sem mudar o status', () => {
      const result = evaluateRegulatoryCompliance({ ...base, art42: thirdEarlyStart });
      expect(result.status).toBe('COMPLIANT');
      expect(result.pendingValidation).toEqual([
        expect.objectContaining({ code: 'LAW_ART42_CONSECUTIVE', actual: 3, limit: 2, source: 'LAW' }),
      ]);
    });

    it('não presume conformidade quando art. 42 está ativado mas falta horário de madrugada intermediária', () => {
      const evidence = evaluateLawArt42Madrugadas('2026-09-26', [
        { data: '2026-09-24', hora_apresentacao: '05:30', hora_termino: '14:00' },
        { data: '2026-09-25', hora_apresentacao: null, hora_termino: null },
        { data: '2026-09-26', hora_apresentacao: '05:30', hora_termino: '14:00' },
      ]);
      expect(evidence.incompleteDuties).toBe(1);
      const result = evaluateRegulatoryCompliance({ ...base, art42: evidence, art42Enforced: true });
      expect(result.status).toBe('UNKNOWN');
      expect(result.unknownReasons).toContain('LAW_ART42_DUTY_TIMES_INCOMPLETE');
      expect(result.violations).toHaveLength(0);
    });

    it('mantém a violação comprovada mesmo com jornada adicional sem horário no histórico', () => {
      const evidence = evaluateLawArt42Madrugadas('2026-09-26', [
        { data: '2026-09-23', hora_apresentacao: null, hora_termino: null },
        { data: '2026-09-24', hora_apresentacao: '05:30', hora_termino: '14:00' },
        { data: '2026-09-25', hora_apresentacao: '05:30', hora_termino: '14:00' },
        { data: '2026-09-26', hora_apresentacao: '05:30', hora_termino: '14:00' },
      ]);
      const result = evaluateRegulatoryCompliance({ ...base, art42: evidence, art42Enforced: true });
      expect(result.status).toBe('VIOLATION');
      expect(result.violations.map((violation) => violation.code)).toContain('LAW_ART42_CONSECUTIVE');
      expect(result.unknownReasons).toContain('LAW_ART42_DUTY_TIMES_INCOMPLETE');
    });

    it('com ativação validada no perfil, a terceira madrugada consecutiva é violação legal', () => {
      const result = evaluateRegulatoryCompliance({ ...base, art42: thirdEarlyStart, art42Enforced: true });
      expect(result.status).toBe('VIOLATION');
      expect(result.violations.map((v) => v.code)).toContain('LAW_ART42_CONSECUTIVE');
      expect(result.pendingValidation).toBeUndefined();
    });
  });

  describe('lei como fonte, ACT só na vigência e piso legal de jornada', () => {
    const missionViolation = {
      inMission: true, missionDay: 22, effectiveWorkDaysAtOperation: 18,
      effectiveWorkEvidenceComplete: true, incompleteReasons: [],
    };
    const base = {
      empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
      costaDoSolActApplicable: true, journeyDurationMin: 8 * 60, rolling, rollingCoverage: completeCoverage, work, limites,
    };

    it('art. 41 §§2º–3º são LAW e citam o ACT dentro da vigência', () => {
      const result = evaluateRegulatoryCompliance({ ...base, dataReferencia: '2026-09-26', mission: missionViolation });
      const codes = result.violations.filter((v) => v.code.startsWith('ACT_CDS_'));
      expect(codes.map((v) => v.source)).toEqual(['LAW', 'LAW']);
      expect(codes[0].reference).toBe('Lei 13.475/2017 art. 41 §2º; ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 9ª caput');
    });

    it('antes de 01/12/2025 o ACT 2025/2027 não é citado', () => {
      const result = evaluateRegulatoryCompliance({ ...base, dataReferencia: '2025-11-30', mission: missionViolation });
      const references = result.violations.map((v) => v.reference);
      expect(references).toContain('Lei 13.475/2017 art. 41 §2º');
      expect(references.some((r) => r.includes('ACT'))).toBe(false);
    });

    it('jornada acima de 18 h viola o art. 37 em qualquer composição', () => {
      const result = evaluateRegulatoryCompliance({
        ...base, journeyDurationMin: 18 * 60 + 1, limites: { ...limites, FDP_MAXIMO_HORAS: 20 },
      });
      expect(result.violations.map((v) => v.code)).toContain('LAW_DUTY_18H');
    });

    it('perfil acima de 11 h não declara conformidade legal para jornada de 12 h', () => {
      const result = evaluateRegulatoryCompliance({
        ...base, journeyDurationMin: 12 * 60, limites: { ...limites, FDP_MAXIMO_HORAS: 14 },
      });
      expect(result.status).toBe('UNKNOWN');
      expect(result.unknownReasons).toContain('LAW_DUTY_CREW_COMPOSITION_UNKNOWN');
    });

    it('jornada de exatamente 11 h com perfil de 14 h permanece conforme', () => {
      const result = evaluateRegulatoryCompliance({
        ...base, journeyDurationMin: 11 * 60, limites: { ...limites, FDP_MAXIMO_HORAS: 14 },
      });
      expect(result.status).toBe('COMPLIANT');
    });
  });

  describe('sanitizeRollingRegulatoryEvidence', () => {
    const raw = { ...rolling };
    it('acumulado nulo é evidência ausente, não zero', () => {
      expect(sanitizeRollingRegulatoryEvidence({ ...raw, hv_28_dias_min: null })).toBeNull();
    });
    it('ano civil menor que o mês denuncia linha legada e vira ausente só no ano', () => {
      const result = sanitizeRollingRegulatoryEvidence({ ...raw, hv_mes_calendario_min: 600, hv_ano_calendario_min: 0 });
      expect(result?.hv_ano_calendario_min).toBeNull();
      expect(result?.hv_mes_calendario_min).toBe(600);
    });
    it('repouso nulo falha fechado', () => {
      const result = sanitizeRollingRegulatoryEvidence({ ...raw, repouso_anterior_min: null, repouso_suficiente: null });
      expect(result).toMatchObject({ repouso_anterior_min: -1, repouso_suficiente: 0 });
    });
  });
});
