/**
 * AirTrust FRMS — non-compensatory risk orchestration.
 *
 * Existing biological/circadian score remains a separate input. Compliance,
 * operational demand and environmental load cannot be cancelled by a good
 * score in another domain.
 */

import type { ComplianceEvaluation } from './compliance-policy';
import type { EnvironmentalRiskAssessment } from './environmental-risk';
import type { OperationalDemandAssessment } from './operational-demand';

export type AirTrustRiskLevel = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'VIOLATION' | 'UNKNOWN';

export interface FrmsRiskOrchestrationInput {
  compliance: ComplianceEvaluation[];
  regulatoryProfileReady: boolean;
  biologicalLevel: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  operational: OperationalDemandAssessment;
  environmental: EnvironmentalRiskAssessment;
}

export interface FrmsRiskOrchestrationResult {
  overallLevel: AirTrustRiskLevel;
  complianceLevel: AirTrustRiskLevel;
  biologicalLevel: AirTrustRiskLevel;
  operationalLevel: AirTrustRiskLevel;
  environmentalLevel: AirTrustRiskLevel;
  automaticApprovalAllowed: boolean;
  alerts: string[];
  reasons: string[];
}

const rank: Record<AirTrustRiskLevel, number> = {
  UNKNOWN: -1,
  NORMAL: 0,
  ELEVATED: 1,
  HIGH: 2,
  CRITICAL: 3,
  VIOLATION: 4,
};

function maxLevel(values: AirTrustRiskLevel[]): AirTrustRiskLevel {
  return values.reduce((current, value) => (rank[value] > rank[current] ? value : current), 'UNKNOWN');
}

function mapOperational(level: OperationalDemandAssessment['level']): AirTrustRiskLevel {
  return level === 'LOW'
    ? 'NORMAL'
    : level === 'MODERATE'
      ? 'ELEVATED'
      : level === 'HIGH'
        ? 'HIGH'
        : level === 'CRITICAL'
          ? 'CRITICAL'
          : 'UNKNOWN';
}

function mapEnvironmental(level: EnvironmentalRiskAssessment['level']): AirTrustRiskLevel {
  return level === 'ELEVATED' ? 'ELEVATED' : level === 'HIGH' ? 'HIGH' : level === 'CRITICAL' ? 'CRITICAL' : level;
}

export function orchestrateFrmsRisk(input: FrmsRiskOrchestrationInput): FrmsRiskOrchestrationResult {
  const anyViolation = input.compliance.some((item) => item.status === 'VIOLATION');
  const anyComplianceUnknown = input.compliance.some((item) => item.status === 'UNKNOWN');
  const complianceLevel: AirTrustRiskLevel = anyViolation
    ? 'VIOLATION'
    : !input.regulatoryProfileReady || anyComplianceUnknown
      ? 'UNKNOWN'
      : 'NORMAL';

  const operationalLevel = mapOperational(input.operational.level);
  const environmentalLevel = mapEnvironmental(input.environmental.level);
  const biologicalLevel = input.biologicalLevel;

  let overallLevel = maxLevel([
    complianceLevel,
    biologicalLevel,
    operationalLevel,
    environmentalLevel,
  ]);

  const reasons: string[] = [];
  const alerts = [...input.operational.alerts, ...input.environmental.alerts];

  if (!input.regulatoryProfileReady) {
    alerts.push('PERFIL_REGULATORIO_NAO_CONFIGURADO');
    reasons.push('Perfil regulatório ANAC aplicável não está documentado/configurado.');
  }
  if (anyViolation) {
    reasons.push('Existe violação de limite obrigatório; nenhum score pode compensá-la.');
    overallLevel = 'VIOLATION';
  }

  // Explicit interaction required by the AirTrust IOGP design: high heat/cold
  // plus high operational demand escalates to CRITICAL even if neither domain
  // individually reached the critical threshold.
  if (
    rank[operationalLevel] >= rank.HIGH &&
    rank[environmentalLevel] >= rank.HIGH &&
    overallLevel !== 'VIOLATION'
  ) {
    overallLevel = 'CRITICAL';
    alerts.push('OPERATIONAL_ENVIRONMENT_INTERACTION');
    reasons.push('Demanda operacional alta combinada com carga ambiental alta.');
  }

  if (input.operational.dataQuality !== 'COMPLETE') {
    alerts.push('OPERATIONAL_DATA_LOW_CONFIDENCE');
  }
  if (input.environmental.dataQuality !== 'COMPLETE') {
    alerts.push('ENVIRONMENTAL_DATA_LOW_CONFIDENCE');
  }

  const uniqueAlerts = [...new Set(alerts)];
  const automaticApprovalAllowed =
    input.regulatoryProfileReady &&
    complianceLevel === 'NORMAL' &&
    rank[overallLevel] < rank.CRITICAL &&
    input.operational.dataQuality !== 'INSUFFICIENT' &&
    input.environmental.dataQuality !== 'INSUFFICIENT';

  return {
    overallLevel,
    complianceLevel,
    biologicalLevel,
    operationalLevel,
    environmentalLevel,
    automaticApprovalAllowed,
    alerts: uniqueAlerts,
    reasons,
  };
}
