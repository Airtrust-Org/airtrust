/**
 * Stable API/audit contract for the AirTrust IOGP/ANAC FRMS evaluation.
 * The biological domain is kept as a summary so the current engine remains
 * independent and can evolve without breaking the compliance evidence model.
 */

import type { ComplianceEvaluation } from './compliance-policy';
import type { EnvironmentalRiskAssessment } from './environmental-risk';
import type { FrmsRiskOrchestrationResult } from './frms-risk-orchestrator';
import type { OperationalDemandAssessment } from './operational-demand';

export const FRMS_IOGP_EVALUATION_SCHEMA_VERSION = 1 as const;

export interface FrmsBiologicalSummary {
  level: 'NORMAL' | 'ELEVATED' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
  effectivenessPct?: number | null;
  legacyFatigueScore?: number | null;
  kss?: number | null;
  sleepMinutes?: number | null;
  source: 'CURRENT_AIRTRUST_ENGINE';
}

export interface FrmsIogpEvaluationSnapshot {
  schemaVersion: typeof FRMS_IOGP_EVALUATION_SCHEMA_VERSION;
  evaluationVersion: string;
  evaluatedAt: string;
  empresaId: number;
  tripulanteId: number;
  jornadaId: string;
  dataOperacional: string;
  regulatoryProfileCode: string | null;
  regulatoryProfileReference: string | null;
  compliance: ComplianceEvaluation[];
  biological: FrmsBiologicalSummary;
  operational: OperationalDemandAssessment;
  environmental: EnvironmentalRiskAssessment;
  orchestration: FrmsRiskOrchestrationResult;
  evidence: {
    sigvoosLegKeys: string[];
    weatherStations: string[];
    weatherSource: 'DECEA_REDEMET' | 'MIXED' | 'UNAVAILABLE';
    missingData: string[];
  };
}

export function buildFrmsIogpEvaluationSnapshot(
  input: Omit<FrmsIogpEvaluationSnapshot, 'schemaVersion' | 'evaluatedAt'> & {
    evaluatedAt?: string;
  },
): FrmsIogpEvaluationSnapshot {
  if (!Number.isInteger(input.empresaId) || input.empresaId <= 0) {
    throw new Error('empresaId is required for FRMS evaluation snapshot.');
  }
  if (!Number.isInteger(input.tripulanteId) || input.tripulanteId <= 0) {
    throw new Error('tripulanteId is required for FRMS evaluation snapshot.');
  }
  if (!input.jornadaId) throw new Error('jornadaId is required for FRMS evaluation snapshot.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataOperacional)) {
    throw new Error('dataOperacional must be YYYY-MM-DD.');
  }

  return {
    ...input,
    schemaVersion: FRMS_IOGP_EVALUATION_SCHEMA_VERSION,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    evidence: {
      ...input.evidence,
      sigvoosLegKeys: [...new Set(input.evidence.sigvoosLegKeys)].sort(),
      weatherStations: [...new Set(input.evidence.weatherStations)].sort(),
      missingData: [...new Set(input.evidence.missingData)].sort(),
    },
  };
}
