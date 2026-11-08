/**
 * FRMS F2 — matriz independente de cenários regulatórios.
 *
 * Complementa (sem duplicar) compliance-policy / regulatory-compliance-adversarial:
 * limites simultâneos de naturezas diferentes, casos mistos violação+desconhecido,
 * cobertura parcial, fronteiras temporais e independência entre motor canônico
 * (Lei/ANAC/ACT) e shadow IOGP. Nenhum parâmetro de produção é alterado.
 *
 * Fontes: Lei 13.475/2017 arts. 32 IV, 33 IV, 37, 41; RBAC 117 EMD 01
 * A117.23(b), B/C117.25-27; ACT Costa do Sol 2025/2027 (vigência 2025-12-01..2027-11-30);
 * IOGP 690-2 Tabela 17-1 (valores de tripulação dupla; fonte primária ainda sem hash no manifesto).
 */
import { describe, expect, it } from 'vitest';
import {
  evaluateRegulatoryCompliance,
  sanitizeRollingRegulatoryEvidence,
  type RegulatoryComplianceInput,
  type RollingFlightCoverageEvidence,
} from '../../lib/frms/regulatory-compliance';
import { buildIogpComplianceEvaluations } from '../../lib/frms/frms-iogp-compliance-builder';
import {
  anacBasicRestAfterDutyMin,
  costaDoSolAct2025_2027InForce,
  evaluateResolvedLimit,
  resolveMostRestrictiveLimit,
  buildIogp6902CoreCandidates,
  buildAnacBasicHelicopterCandidates,
} from '../../lib/frms/compliance-policy';

const H = 60;
const limites = { FDP_MAXIMO_HORAS: 11, HV_DIARIA_HORAS: 8, HV_MES_HORAS: 90, HV_28_DIAS_HORAS: 93, HV_365_DIAS_HORAS: 930 };
const rolling = {
  data_referencia: '2026-09-26', funcionario_id: 7, hv_dia_min: 120, hv_mes_calendario_min: 600,
  hv_28_dias_min: 600, hv_365_dias_min: 5000, hv_ano_calendario_min: 5000,
  repouso_anterior_min: 900, repouso_suficiente: 1,
};
const work = { monthWorkToDateMin: 3000, rolling7dWorkMin: 1800, rolling14dWorkMin: 3000, completeThroughDate: true, incompleteReasons: [] as string[] };
const fullCoverage: RollingFlightCoverageEvidence = {
  sourceVerified: true,
  windows: {
    month: { expectedDays: 8, confirmedDays: 8 }, year: { expectedDays: 70, confirmedDays: 70 },
    days28: { expectedDays: 8, confirmedDays: 8 }, days365: { expectedDays: 70, confirmedDays: 70 },
  },
};
const base = (over: Partial<RegulatoryComplianceInput> = {}): RegulatoryComplianceInput => ({
  empresaId: 6, profileCode: 'HELICOPTER_OFFSHORE', rbacBcApplicable: false,
  journeyDurationMin: 600, rolling, rollingCoverage: fullCoverage, work, limites, ...over,
});
const codes = (r: ReturnType<typeof evaluateRegulatoryCompliance>) => r.violations.map((v) => v.code).sort();

describe('limites simultâneos — nenhuma violação mascara outra', () => {
  it('reporta todas as violações de naturezas/janelas diferentes ao mesmo tempo', () => {
    const r = evaluateRegulatoryCompliance(base({
      journeyDurationMin: 19 * H,
      rolling: { ...rolling, hv_dia_min: 8 * H + 1, hv_mes_calendario_min: 90 * H + 1, hv_ano_calendario_min: 930 * H + 1 },
      work: { ...work, monthWorkToDateMin: 176 * H + 1 },
    }));
    expect(r.status).toBe('VIOLATION');
    expect(codes(r)).toEqual(expect.arrayContaining([
      'LAW_HELI_FLIGHT_DAY_8H', 'LAW_HELI_FLIGHT_MONTH_90H', 'LAW_HELI_FLIGHT_YEAR_930H',
      'WORK_MONTH_176H', 'LAW_DUTY_18H', 'PROFILE_FDP_DAILY',
    ]));
  });

  it('mês civil no limite e 28d alto são janelas independentes (nenhuma substitui a outra)', () => {
    const r = evaluateRegulatoryCompliance(base({
      rbacBcApplicable: true,
      rolling: { ...rolling, hv_mes_calendario_min: 40 * H, hv_28_dias_min: 93 * H + 1 },
    }));
    expect(codes(r)).toEqual(['RBAC117_BC_FLIGHT_28D_93H']);
  });

  it('fronteira exata de todos os limites simultâneos é COMPLIANT; +1 min em apenas um isola a violação', () => {
    const atLimit = base({
      rbacBcApplicable: true, journeyDurationMin: 11 * H,
      rolling: { ...rolling, hv_dia_min: 8 * H, hv_mes_calendario_min: 90 * H, hv_28_dias_min: 93 * H, hv_365_dias_min: 930 * H, hv_ano_calendario_min: 930 * H },
      work: { ...work, monthWorkToDateMin: 176 * H, rolling7dWorkMin: 60 * H, rolling14dWorkMin: 100 * H },
    });
    expect(evaluateRegulatoryCompliance(atLimit).status).toBe('COMPLIANT');
    const over = { ...atLimit, work: { ...atLimit.work!, rolling14dWorkMin: 100 * H + 1 } };
    expect(codes(evaluateRegulatoryCompliance(over))).toEqual(['RBAC117_BC_WORK_14D_100H']);
  });
});

describe('dados ausentes e casos mistos', () => {
  it('cobertura parcial sem excedente => UNKNOWN, nunca COMPLIANT', () => {
    const partial = { ...fullCoverage, windows: { ...fullCoverage.windows, days28: { expectedDays: 8, confirmedDays: 7 } } };
    const r = evaluateRegulatoryCompliance(base({ rollingCoverage: partial }));
    expect(r.status).toBe('UNKNOWN');
    expect(r.unknownReasons).toContain('ROLLING_FLIGHT_COVERAGE_INCOMPLETE');
  });

  it('cobertura parcial COM excedente demonstrado => VIOLATION (excedente é limite inferior)', () => {
    const partial = { ...fullCoverage, sourceVerified: false };
    const r = evaluateRegulatoryCompliance(base({
      rollingCoverage: partial, rolling: { ...rolling, hv_mes_calendario_min: 91 * H },
    }));
    expect(r.status).toBe('VIOLATION');
    expect(r.unknownReasons).toContain('ROLLING_FLIGHT_COVERAGE_INCOMPLETE');
  });

  it('ledger vazio 0/0 não prova cobertura', () => {
    const empty = { sourceVerified: true, windows: {
      month: { expectedDays: 0, confirmedDays: 0 }, year: { expectedDays: 0, confirmedDays: 0 },
      days28: { expectedDays: 0, confirmedDays: 0 }, days365: { expectedDays: 0, confirmedDays: 0 } } };
    expect(evaluateRegulatoryCompliance(base({ rollingCoverage: empty })).status).toBe('UNKNOWN');
  });

  it('sem evidência de trabalho => UNKNOWN; sem rolling => UNKNOWN; sem cobertura => UNKNOWN', () => {
    expect(evaluateRegulatoryCompliance(base({ work: null })).unknownReasons).toContain('WORK_TIME_EVIDENCE_MISSING');
    expect(evaluateRegulatoryCompliance(base({ rolling: null })).status).toBe('UNKNOWN');
    expect(evaluateRegulatoryCompliance(base({ rollingCoverage: null })).status).toBe('UNKNOWN');
  });

  it('repouso desconhecido (-1) é UNKNOWN; repouso insuficiente comprovado é VIOLATION', () => {
    expect(evaluateRegulatoryCompliance(base({ rolling: { ...rolling, repouso_anterior_min: -1 } })).unknownReasons)
      .toContain('REST_EVIDENCE_UNKNOWN');
    const r = evaluateRegulatoryCompliance(base({ rolling: { ...rolling, repouso_anterior_min: 300, repouso_suficiente: 0 } }));
    expect(codes(r)).toEqual(['PROFILE_REST_MINIMUM']);
  });

  it('jornada 11–18 h com perfil permissivo => UNKNOWN (composição da tripulação ausente), não COMPLIANT', () => {
    const r = evaluateRegulatoryCompliance(base({
      journeyDurationMin: 13 * H, limites: { ...limites, FDP_MAXIMO_HORAS: 14 },
    }));
    expect(r.status).toBe('UNKNOWN');
    expect(r.unknownReasons).toContain('LAW_DUTY_CREW_COMPOSITION_UNKNOWN');
  });

  it('missão: 22º dia + evidência de trabalho efetivo incompleta => VIOLATION e UNKNOWN registrado', () => {
    const r = evaluateRegulatoryCompliance(base({
      costaDoSolActApplicable: true, dataReferencia: '2026-09-26',
      mission: { inMission: true, missionDay: 22, effectiveWorkDaysAtOperation: null, effectiveWorkEvidenceComplete: false, incompleteReasons: ['X'] },
    }));
    expect(r.status).toBe('VIOLATION');
    expect(codes(r)).toContain('ACT_CDS_MISSION_21D');
    expect(r.unknownReasons).toContain('ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE');
  });
});

describe('motor canônico vs shadow IOGP — janelas distintas, o mais restritivo domina', () => {
  it('9 h de voo no dia: IOGP (10 h) aprova, Lei (8 h) reprova — IOGP não resgata', () => {
    const canon = evaluateRegulatoryCompliance(base({ rolling: { ...rolling, hv_dia_min: 9 * H } }));
    const iogp = buildIogpComplianceEvaluations({
      hv_dia_min: 9 * H, hv_7_dias_min: 10 * H, hv_28_dias_min: 10 * H, hv_365_dias_min: 10 * H,
      coverage: { sourceVerified: true, windows: { day1: true, days7: true, days28: true, days365: true } },
    });
    expect(iogp[0].status).toBe('COMPLIANT');
    expect(canon.status).toBe('VIOLATION');
  });

  it('IOGP 7d/28d/365d usam janela rolante; mês civil (Lei) não é comparado com 28d', () => {
    expect(() => resolveMostRestrictiveLimit('FLIGHT_TIME_28D_ROLLING_MIN', 'MAX', [
      ...buildIogp6902CoreCandidates().filter((c) => c.metric === 'FLIGHT_TIME_28D_ROLLING_MIN'),
      ...buildAnacBasicHelicopterCandidates({ service: 'RBAC117_117_1_B2_TO_B6', fdpMaxMin: 11 * H, previousDutyMin: 600 })
        .filter((c) => c.metric === 'FLIGHT_TIME_MONTH_CALENDAR_MIN'),
    ])).toThrow(/different metrics/);
  });

  it('IOGP sem cobertura verificada nunca é COMPLIANT; excedente é VIOLATION mesmo sem cobertura', () => {
    const r = buildIogpComplianceEvaluations({ hv_dia_min: 0, hv_7_dias_min: 46 * H, hv_28_dias_min: 0, hv_365_dias_min: 0 });
    expect(r.map((e) => e.status)).toEqual(['UNKNOWN', 'VIOLATION', 'UNKNOWN', 'UNKNOWN']);
  });

  it('avaliação de limite com valor ausente/negativo/NaN é UNKNOWN', () => {
    const resolved = resolveMostRestrictiveLimit('FLIGHT_TIME_1D_CONSECUTIVE_MIN', 'MAX',
      buildIogp6902CoreCandidates().filter((c) => c.metric === 'FLIGHT_TIME_1D_CONSECUTIVE_MIN'));
    for (const v of [null, undefined, -1, NaN]) {
      expect(evaluateResolvedLimit(v as number | null, resolved).status).toBe('UNKNOWN');
    }
  });
});

describe('fronteiras temporais e de faixa', () => {
  it('vigência do ACT 2025/2027: bordas inclusivas', () => {
    expect(costaDoSolAct2025_2027InForce('2025-11-30')).toBe(false);
    expect(costaDoSolAct2025_2027InForce('2025-12-01')).toBe(true);
    expect(costaDoSolAct2025_2027InForce('2027-11-30')).toBe(true);
    expect(costaDoSolAct2025_2027InForce('2027-12-01')).toBe(false);
  });

  it('repouso ANAC A117.23(b): 12 h / 16 h / 24 h nas fronteiras de duty', () => {
    expect(anacBasicRestAfterDutyMin(12 * H)).toBe(12 * H);
    expect(anacBasicRestAfterDutyMin(12 * H + 1)).toBe(16 * H);
    expect(anacBasicRestAfterDutyMin(15 * H)).toBe(16 * H);
    expect(anacBasicRestAfterDutyMin(15 * H + 1)).toBe(24 * H);
  });

  it('referência sem ACT em vigor não cita o ACT na violação de mês', () => {
    const r = evaluateRegulatoryCompliance(base({
      costaDoSolActApplicable: true, dataReferencia: '2025-11-30',
      work: { ...work, monthWorkToDateMin: 177 * H },
    }));
    expect(r.violations[0].reference).not.toMatch(/ACT/);
  });
});

describe('sanitização de evidência — ausente nunca vira zero', () => {
  const raw = { data_referencia: '2026-09-26', funcionario_id: 7, repouso_anterior_min: 900, repouso_suficiente: 1 };
  it('linha sem nenhuma leitura de voo válida é descartada', () => {
    expect(sanitizeRollingRegulatoryEvidence({ ...raw, hv_dia_min: null, hv_mes_calendario_min: '', hv_28_dias_min: -5, hv_365_dias_min: 'x', hv_ano_calendario_min: undefined })).toBeNull();
  });
  it('janela inválida vira null; janela válida e violação provada são preservadas', () => {
    const s = sanitizeRollingRegulatoryEvidence({ ...raw, hv_dia_min: 9 * H, hv_mes_calendario_min: null, hv_28_dias_min: NaN, hv_365_dias_min: 1, hv_ano_calendario_min: 1 })!;
    expect(s.hv_dia_min).toBe(9 * H);
    expect(s.hv_28_dias_min).toBeNull();
    expect(s.hv_mes_calendario_min).toBeNull();
  });
  it('ano civil menor que mês civil é descartado (linha anterior à coluna anual)', () => {
    const s = sanitizeRollingRegulatoryEvidence({ ...raw, hv_dia_min: 60, hv_mes_calendario_min: 50 * H, hv_28_dias_min: 60, hv_365_dias_min: 60, hv_ano_calendario_min: 0 })!;
    expect(s.hv_ano_calendario_min).toBeNull();
  });
  it('repouso ausente => -1 (desconhecido), nunca 0 h nem suficiente', () => {
    const s = sanitizeRollingRegulatoryEvidence({ ...raw, hv_dia_min: 60, repouso_anterior_min: null, repouso_suficiente: 1 })!;
    expect(s.repouso_anterior_min).toBe(-1);
  });
});
