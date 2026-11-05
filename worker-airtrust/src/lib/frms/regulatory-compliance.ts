import type { LimitesMap } from './types';
import type { Art42Evaluation } from './law-art42-madrugadas';
import { costaDoSolAct2025_2027InForce } from './compliance-policy';

export interface RollingRegulatoryEvidence {
  data_referencia: string;
  funcionario_id: number;
  hv_dia_min: number;
  hv_mes_calendario_min: number;
  hv_28_dias_min: number;
  hv_365_dias_min: number;
  hv_ano_calendario_min: number | null;
  repouso_anterior_min: number;
  repouso_suficiente: number;
}

type RawRollingRegulatoryEvidence = {
  [K in keyof RollingRegulatoryEvidence]: RollingRegulatoryEvidence[K] | number | string | null | undefined;
};

function nonNegativeMinutes(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Acumulado nulo ou incoerente é evidência ausente, nunca zero. O ano civil
 * menor que o mês civil denuncia linha anterior à coluna anual (default 0 da
 * migration 0498) e é descartado apenas nessa dimensão.
 */
export function sanitizeRollingRegulatoryEvidence(
  row: RawRollingRegulatoryEvidence,
): RollingRegulatoryEvidence | null {
  const hvDia = nonNegativeMinutes(row.hv_dia_min);
  const hvMes = nonNegativeMinutes(row.hv_mes_calendario_min);
  const hv28 = nonNegativeMinutes(row.hv_28_dias_min);
  const hv365 = nonNegativeMinutes(row.hv_365_dias_min);
  if (hvDia == null || hvMes == null || hv28 == null || hv365 == null) return null;
  const hvAno = nonNegativeMinutes(row.hv_ano_calendario_min);
  const repouso = nonNegativeMinutes(row.repouso_anterior_min);
  return {
    data_referencia: String(row.data_referencia),
    funcionario_id: Number(row.funcionario_id),
    hv_dia_min: hvDia,
    hv_mes_calendario_min: hvMes,
    hv_28_dias_min: hv28,
    hv_365_dias_min: hv365,
    hv_ano_calendario_min: hvAno != null && hvAno >= hvMes ? hvAno : null,
    repouso_anterior_min: repouso ?? -1,
    repouso_suficiente: Number(row.repouso_suficiente) === 1 ? 1 : 0,
  };
}

/** Source-confirmed operational coverage for each rolling flight-hour window.
 * Counts alone never certify completeness unless a tenant-scoped source ledger
 * verified every expected operational day; unavailable is UNKNOWN, not zero.
 */
export interface RollingFlightCoverageEvidence {
  sourceVerified: boolean;
  windows: {
    month: { expectedDays: number; confirmedDays: number };
    year: { expectedDays: number; confirmedDays: number };
    days28: { expectedDays: number; confirmedDays: number };
    days365: { expectedDays: number; confirmedDays: number };
  };
}

export function hasCompleteRollingFlightCoverage(
  coverage: RollingFlightCoverageEvidence | null | undefined,
): boolean {
  if (!coverage?.sourceVerified) return false;
  return Object.values(coverage.windows).every(({ expectedDays, confirmedDays }) =>
    Number.isSafeInteger(expectedDays) &&
    Number.isSafeInteger(confirmedDays) &&
    // Toda janela avaliada contém pelo menos a data de referência. Um ledger
    // vazio (0/0) não é prova de cobertura e nunca autoriza COMPLIANT.
    expectedDays > 0 &&
    confirmedDays === expectedDays,
  );
}

export interface WorkRegulatoryEvidence {
  monthWorkToDateMin: number;
  rolling7dWorkMin: number;
  rolling14dWorkMin: number;
  completeThroughDate: boolean;
  incompleteReasons: string[];
}

export interface CostaDoSolMissionEvidence {
  inMission: boolean;
  missionDay: number | null;
  effectiveWorkDaysAtOperation: number | null;
  effectiveWorkEvidenceComplete: boolean;
  incompleteReasons: string[];
  /** ACT Costa do Sol 2025/2027, cláusula 9ª §1º: folga pós-missão = trabalho efetivo no local - 2 dias. */
  postMissionRequiredOffDays?: number | null;
  postMissionCompletedOffDays?: number | null;
  postMissionDutyOnDate?: boolean;
  postMissionRestEvidenceComplete?: boolean;
}

export interface RegulatoryViolation {
  code: string;
  source: 'LAW' | 'ANAC' | 'ACT' | 'PROFILE';
  reference: string;
  actualMin: number;
  limitMin: number;
  message: string;
}
export interface RegulatoryComplianceInput {
  empresaId: number;
  profileCode: string;
  rbacBcApplicable: boolean;
  costaDoSolActApplicable?: boolean;
  /** Data avaliada; o ACT só é citado dentro da vigência (cl. 1ª). */
  dataReferencia?: string;
  mission?: CostaDoSolMissionEvidence | null;
  journeyDurationMin: number;
  rolling: RollingRegulatoryEvidence | null;
  /** Must come from a verified tenant/day status ledger, never inferred from totals. */
  rollingCoverage?: RollingFlightCoverageEvidence | null;
  work: WorkRegulatoryEvidence | null;
  limites: Pick<
    LimitesMap,
    'FDP_MAXIMO_HORAS' | 'HV_DIARIA_HORAS' | 'HV_MES_HORAS' | 'HV_28_DIAS_HORAS' | 'HV_365_DIAS_HORAS'
  >;
  /** Lei 13.475 art. 42 calculado sobre as jornadas com horário da base. */
  art42?: Art42Evaluation | null;
  /**
   * Só o perfil regulatório validado ativa o art. 42 como violação. Sem isso o
   * achado é exibido como pendente de validação, sem alterar o status.
   */
  art42Enforced?: boolean;
}

/** Regra legal calculada, ainda sem validação jurídica para bloquear o status. */
export interface RegulatoryPendingFinding {
  code: string;
  source: 'LAW';
  reference: string;
  actual: number;
  limit: number;
  message: string;
}

export interface RegulatoryComplianceResult {
  status: 'COMPLIANT' | 'VIOLATION' | 'UNKNOWN';
  violations: RegulatoryViolation[];
  unknownReasons: string[];
  pendingValidation?: RegulatoryPendingFinding[];
}

function art42Findings(art42: Art42Evaluation): RegulatoryPendingFinding[] {
  const out: RegulatoryPendingFinding[] = [];
  if (art42.violations.includes('LAW_ART42_CONSECUTIVE')) {
    out.push({
      code: 'LAW_ART42_CONSECUTIVE', source: 'LAW', reference: 'Lei 13.475/2017 art. 42 caput e §4º',
      actual: art42.consecutiveMadrugadas, limit: 2,
      message: `${art42.consecutiveMadrugadas} madrugadas consecutivas de trabalho > limite de 2`,
    });
  }
  if (art42.violations.includes('LAW_ART42_168H')) {
    out.push({
      code: 'LAW_ART42_168H', source: 'LAW', reference: 'Lei 13.475/2017 art. 42 caput, §§2º e 4º',
      actual: art42.madrugadasIn168h, limit: 4,
      message: `${art42.madrugadasIn168h} madrugadas em 168 h > limite de 4`,
    });
  }
  return out;
}

function pushMaxViolation(
  out: RegulatoryViolation[],
  params: Omit<RegulatoryViolation, 'message'> & { label: string },
) {
  if (params.actualMin <= params.limitMin) return;
  out.push({
    ...params,
    message: `${params.label}: ${Math.round(params.actualMin)} min > ${Math.round(params.limitMin)} min`,
  });
}
export function evaluateRegulatoryCompliance(
  input: RegulatoryComplianceInput,
): RegulatoryComplianceResult {
  const violations: RegulatoryViolation[] = [];
  const unknownReasons = new Set<string>();
  const isHelicopter = input.profileCode === 'HELICOPTER_OFFSHORE';

  if (!isHelicopter) {
    unknownReasons.add('HELICOPTER_LIMITS_NOT_APPLICABLE_TO_PROFILE');
  } else if (!input.rolling) {
    unknownReasons.add('ROLLING_REGULATORY_EVIDENCE_MISSING');
  } else {
    if (!hasCompleteRollingFlightCoverage(input.rollingCoverage)) {
      unknownReasons.add('ROLLING_FLIGHT_COVERAGE_INCOMPLETE');
    }
    pushMaxViolation(violations, {
      code: 'LAW_HELI_FLIGHT_DAY_8H',
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 32 IV',
      actualMin: input.rolling.hv_dia_min,
      limitMin: 8 * 60,
      label: 'Horas de voo em 24h',
    });
    pushMaxViolation(violations, {
      code: 'LAW_HELI_FLIGHT_MONTH_90H',
      source: 'LAW',
      reference: 'Lei 13.475/2017 art. 33 IV',
      actualMin: input.rolling.hv_mes_calendario_min,
      limitMin: 90 * 60,
      label: 'Horas de voo no mês calendário',
    });
    if (input.limites.HV_DIARIA_HORAS > 0 && input.limites.HV_DIARIA_HORAS < 8) {
      pushMaxViolation(violations, {
        code: 'PROFILE_FLIGHT_DAY_LIMIT', source: 'PROFILE',
        reference: 'Perfil FRMS governado / HV_DIARIA_HORAS',
        actualMin: input.rolling.hv_dia_min,
        limitMin: input.limites.HV_DIARIA_HORAS * 60,
        label: 'Limite diário de voo do perfil',
      });
    }
    if (input.limites.HV_MES_HORAS > 0 && input.limites.HV_MES_HORAS < 90) {
      pushMaxViolation(violations, {
        code: 'PROFILE_FLIGHT_MONTH_LIMIT', source: 'PROFILE',
        reference: 'Perfil FRMS governado / HV_MES_HORAS',
        actualMin: input.rolling.hv_mes_calendario_min,
        limitMin: input.limites.HV_MES_HORAS * 60,
        label: 'Limite mensal de voo do perfil',
      });
    }
    if (input.rolling.hv_ano_calendario_min == null) {
      unknownReasons.add('CALENDAR_YEAR_FLIGHT_EVIDENCE_MISSING');
    } else {
      pushMaxViolation(violations, {
        code: 'LAW_HELI_FLIGHT_YEAR_930H',
        source: 'LAW',
        reference: 'Lei 13.475/2017 art. 33 IV',
        actualMin: input.rolling.hv_ano_calendario_min,
        limitMin: 930 * 60,
        label: 'Horas de voo no ano calendário',
      });
    }

    if (input.rolling.repouso_anterior_min < 0) {
      unknownReasons.add('REST_EVIDENCE_UNKNOWN');
    } else if (input.rolling.repouso_suficiente !== 1) {
      violations.push({
        code: 'PROFILE_REST_MINIMUM',
        source: 'PROFILE',
        reference: 'Perfil FRMS governado / regra de repouso efetiva',
        actualMin: input.rolling.repouso_anterior_min,
        limitMin: 0,
        message: 'Repouso anterior abaixo do mínimo governado para a jornada.',
      });
    }
  }

  if (input.journeyDurationMin > input.limites.FDP_MAXIMO_HORAS * 60) {
    pushMaxViolation(violations, {
      code: 'PROFILE_FDP_DAILY',
      source: 'PROFILE',
      reference: 'Perfil FRMS governado / FDP_MAXIMO_HORAS',
      actualMin: input.journeyDurationMin,
      limitMin: input.limites.FDP_MAXIMO_HORAS * 60,
      label: 'Jornada/FDP diário',
    });
  }
  // Lei 13.475 art. 37 (serviços II–V): 11 h simples, 14 h composta, 18 h revezamento.
  // A composição da tripulação não está no snapshot: acima de 18 h é violação
  // em qualquer composição; entre 11 h e 18 h, com perfil mais permissivo que
  // 11 h, a conformidade legal não é verificável.
  if (isHelicopter && input.journeyDurationMin > 18 * 60) {
    pushMaxViolation(violations, {
      code: 'LAW_DUTY_18H', source: 'LAW',
      reference: 'Lei 13.475/2017 art. 37 III',
      actualMin: input.journeyDurationMin, limitMin: 18 * 60,
      label: 'Jornada acima do maior limite legal (revezamento)',
    });
  } else if (
    isHelicopter &&
    input.journeyDurationMin > 11 * 60 &&
    input.limites.FDP_MAXIMO_HORAS * 60 > 11 * 60
  ) {
    unknownReasons.add('LAW_DUTY_CREW_COMPOSITION_UNKNOWN');
  }

  // Os limites de missão e trabalho estão na Lei 13.475 (art. 41); o ACT é
  // citado como instrumento adicional apenas na sua vigência.
  const actInForce = Boolean(input.costaDoSolActApplicable) &&
    (input.dataReferencia == null || costaDoSolAct2025_2027InForce(input.dataReferencia));
  const withAct = (law: string, clause: string) =>
    actInForce ? `${law}; ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, ${clause}` : law;

  const workLimitApplies = isHelicopter || input.rbacBcApplicable;
  if (workLimitApplies) {
    if (!input.work) {
      unknownReasons.add('WORK_TIME_EVIDENCE_MISSING');
    } else {
      pushMaxViolation(violations, {
        code: 'WORK_MONTH_176H',
        source: 'LAW',
        reference: withAct('Lei 13.475/2017 art. 41 caput', 'cláusula 8ª'),
        actualMin: input.work.monthWorkToDateMin,
        limitMin: 176 * 60,
        label: 'Tempo de trabalho no mês',
      });
      if (!input.work.completeThroughDate) {
        for (const reason of input.work.incompleteReasons) unknownReasons.add(reason);
      }
    }
  }

  if (input.costaDoSolActApplicable && input.mission) {
    if (input.mission.inMission) {
      const missionDay = input.mission.missionDay;
      if (missionDay == null || !Number.isFinite(missionDay) || missionDay <= 0) {
        unknownReasons.add('ACT_CDS_MISSION_DAY_EVIDENCE_MISSING');
      } else if (missionDay > 21) {
        violations.push({
          code: 'ACT_CDS_MISSION_21D', source: 'LAW',
          reference: withAct('Lei 13.475/2017 art. 41 §2º', 'cláusula 9ª caput'),
          actualMin: missionDay * 24 * 60, limitMin: 21 * 24 * 60,
          message: `Missão com ${missionDay} dias > limite de 21 dias`,
        });
      }

      const effective = input.mission.effectiveWorkDaysAtOperation;
      if (effective != null && Number.isFinite(effective) && effective > 17) {
        violations.push({
          code: 'ACT_CDS_EFFECTIVE_17D', source: 'LAW',
          reference: withAct('Lei 13.475/2017 art. 41 §3º', 'cláusula 9ª caput'),
          actualMin: effective * 24 * 60, limitMin: 17 * 24 * 60,
          message: `Trabalho efetivo no local da operação em ${effective} dias > limite de 17 dias`,
        });
      } else if (!input.mission.effectiveWorkEvidenceComplete) {
        unknownReasons.add('ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE');
        for (const reason of input.mission.incompleteReasons) unknownReasons.add(reason);
      }
    }

    if (input.mission.postMissionDutyOnDate) {
      const required = input.mission.postMissionRequiredOffDays;
      const completed = input.mission.postMissionCompletedOffDays;
      if (input.mission.postMissionRestEvidenceComplete === false || required == null || completed == null) {
        unknownReasons.add('ACT_CDS_POST_MISSION_REST_EVIDENCE_INCOMPLETE');
        for (const reason of input.mission.incompleteReasons) unknownReasons.add(reason);
      } else if (completed < required) {
        violations.push({
          code: 'ACT_CDS_POST_MISSION_REST',
          source: 'LAW',
          reference: withAct('Lei 13.475/2017 art. 41 §4º', 'cláusula 9ª, parágrafo 1º'),
          actualMin: completed * 24 * 60,
          limitMin: required * 24 * 60,
          message: `Folga pós-missão: ${completed} de ${required} dias completos antes de nova atividade`,
        });
      }
    }
  }

  if (input.rbacBcApplicable && input.rolling) {
    pushMaxViolation(violations, {
      code: 'RBAC117_BC_FLIGHT_28D_93H', source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.25/C117.25',
      actualMin: input.rolling.hv_28_dias_min, limitMin: 93 * 60,
      label: 'Horas de voo em 28 dias consecutivos',
    });
    pushMaxViolation(violations, {
      code: 'RBAC117_BC_FLIGHT_365D_930H', source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.25/C117.25',
      actualMin: input.rolling.hv_365_dias_min, limitMin: 930 * 60,
      label: 'Horas de voo em 365 dias consecutivos',
    });
  }
  if (input.rbacBcApplicable && input.work) {
    pushMaxViolation(violations, {
      code: 'RBAC117_BC_WORK_7D_60H', source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.27/C117.27',
      actualMin: input.work.rolling7dWorkMin, limitMin: 60 * 60,
      label: 'Tempo de trabalho em 7 dias consecutivos',
    });
    pushMaxViolation(violations, {
      code: 'RBAC117_BC_WORK_14D_100H', source: 'ANAC',
      reference: 'RBAC 117 EMD 01 B117.27/C117.27',
      actualMin: input.work.rolling14dWorkMin, limitMin: 100 * 60,
      label: 'Tempo de trabalho em 14 dias consecutivos',
    });
  }

  const pendingValidation: RegulatoryPendingFinding[] = [];
  if (isHelicopter && input.art42 && input.art42Enforced && input.art42.incompleteDuties > 0) {
    // Missing historical duty times may conceal a consecutive madrugada or 48h reset.
    // Proven violations still take precedence over incomplete evidence.
    unknownReasons.add('LAW_ART42_DUTY_TIMES_INCOMPLETE');
  }
  if (isHelicopter && input.art42) {
    for (const finding of art42Findings(input.art42)) {
      if (input.art42Enforced) {
        violations.push({
          code: finding.code, source: 'LAW', reference: finding.reference,
          actualMin: finding.actual, limitMin: finding.limit, message: finding.message,
        });
      } else {
        pendingValidation.push(finding);
      }
    }
  }
  const pending = pendingValidation.length > 0 ? { pendingValidation } : {};

  if (violations.length > 0) {
    return { status: 'VIOLATION', violations, unknownReasons: [...unknownReasons], ...pending };
  }
  if (unknownReasons.size > 0) {
    return { status: 'UNKNOWN', violations: [], unknownReasons: [...unknownReasons], ...pending };
  }
  return { status: 'COMPLIANT', violations: [], unknownReasons: [], ...pending };
}
