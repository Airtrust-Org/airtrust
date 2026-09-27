import type { LimitesMap } from './types';

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
  mission?: CostaDoSolMissionEvidence | null;
  journeyDurationMin: number;
  rolling: RollingRegulatoryEvidence | null;
  work: WorkRegulatoryEvidence | null;
  limites: Pick<
    LimitesMap,
    'FDP_MAXIMO_HORAS' | 'HV_DIARIA_HORAS' | 'HV_MES_HORAS' | 'HV_28_DIAS_HORAS' | 'HV_365_DIAS_HORAS'
  >;
}

export interface RegulatoryComplianceResult {
  status: 'COMPLIANT' | 'VIOLATION' | 'UNKNOWN';
  violations: RegulatoryViolation[];
  unknownReasons: string[];
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
  const workLimitApplies = isHelicopter || input.rbacBcApplicable;
  if (workLimitApplies) {
    if (!input.work) {
      unknownReasons.add('WORK_TIME_EVIDENCE_MISSING');
    } else {
      pushMaxViolation(violations, {
        code: 'WORK_MONTH_176H',
        source: input.costaDoSolActApplicable ? 'ACT' : 'LAW',
        reference: input.costaDoSolActApplicable
          ? 'Lei 13.475/2017 art. 41; ACT Costa do Sol 2025/2027 cláusula 8ª'
          : 'Lei 13.475/2017 art. 41',
        actualMin: input.work.monthWorkToDateMin,
        limitMin: 176 * 60,
        label: 'Tempo de trabalho no mês',
      });
      if (!input.work.completeThroughDate) {
        for (const reason of input.work.incompleteReasons) unknownReasons.add(reason);
      }
    }
  }

  if (input.costaDoSolActApplicable && input.mission?.inMission) {
    const missionDay = input.mission.missionDay;
    if (missionDay == null || !Number.isFinite(missionDay) || missionDay <= 0) {
      unknownReasons.add('ACT_CDS_MISSION_DAY_EVIDENCE_MISSING');
    } else if (missionDay > 21) {
      violations.push({
        code: 'ACT_CDS_MISSION_21D', source: 'ACT',
        reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 9ª caput',
        actualMin: missionDay * 24 * 60, limitMin: 21 * 24 * 60,
        message: `Missão com ${missionDay} dias > limite de 21 dias`,
      });
    }

    const effective = input.mission.effectiveWorkDaysAtOperation;
    if (effective != null && Number.isFinite(effective) && effective > 17) {
      violations.push({
        code: 'ACT_CDS_EFFECTIVE_17D', source: 'ACT',
        reference: 'ACT Costa do Sol Táxi Aéreo S.A. 2025/2027, cláusula 9ª caput',
        actualMin: effective * 24 * 60, limitMin: 17 * 24 * 60,
        message: `Trabalho efetivo no local da operação em ${effective} dias > limite de 17 dias`,
      });
    } else if (!input.mission.effectiveWorkEvidenceComplete) {
      unknownReasons.add('ACT_CDS_EFFECTIVE_DAYS_AT_LOCATION_EVIDENCE_INCOMPLETE');
      for (const reason of input.mission.incompleteReasons) unknownReasons.add(reason);
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

  if (violations.length > 0) {
    return { status: 'VIOLATION', violations, unknownReasons: [...unknownReasons] };
  }
  if (unknownReasons.size > 0) {
    return { status: 'UNKNOWN', violations: [], unknownReasons: [...unknownReasons] };
  }
  return { status: 'COMPLIANT', violations: [], unknownReasons: [] };
}
