import { loadEdbShadowPreview } from './control-flight-shadow-preview';
import {
  evaluateEdbShadowDivergence,
  type EdbShadowDivergenceResult,
} from './shadow-divergence-engine';
import { EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION } from './technical-status-shadow-contracts';

export const EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION =
  'edb.shadow-assessment.v1' as const;

export type EdbShadowTechnicalAssessmentStatus =
  | 'source_unavailable'
  | 'requires_review'
  | 'preliminarily_available';

export interface EdbShadowPreliminaryAssessment {
  schemaVersion: typeof EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION;
  classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT';
  officialReferenceCompared: false;
  paperReferenceRequired: true;
  comparisonBasis: 'SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS';
  notices: {
    officialLogbook: false;
    replacesPaper: false;
    containsSignature: false;
    persistsRegulatedRecord: false;
    authorizesReturnToService: false;
  };
  divergence: EdbShadowDivergenceResult;
  technicalStatus: {
    targetSchemaVersion: typeof EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION;
    officialEffect: 'NONE';
    sourceAvailable: boolean;
    detailedContractLoaded: false;
    discrepancyDetailsAvailable: false;
    status: EdbShadowTechnicalAssessmentStatus;
    findingCodes: string[];
  };
}

function technicalAssessmentStatus(
  sourceAvailable: boolean,
  divergence: EdbShadowDivergenceResult,
): EdbShadowTechnicalAssessmentStatus {
  if (!sourceAvailable) return 'source_unavailable';
  const hasTechnicalFinding = divergence.findings.some(
    (finding) =>
      finding.category === 'TECHNICAL_STATUS_MISMATCH' ||
      finding.field.startsWith('technicalStatus.'),
  );
  return hasTechnicalFinding ? 'requires_review' : 'preliminarily_available';
}

export async function loadEdbShadowPreliminaryAssessment(
  db: D1Database,
  tenantId: number,
  flightId: number,
): Promise<EdbShadowPreliminaryAssessment> {
  const preview = await loadEdbShadowPreview(db, tenantId, flightId);

  // There is no official-paper reference in this route. Comparing the draft with itself prevents
  // fabricated value divergences while still running completeness and sanitized projection findings
  // through the canonical engine. A real paper comparison remains mandatory in the shadow review.
  const divergence = evaluateEdbShadowDivergence({
    expectedTenantId: tenantId,
    draft: preview.draft,
    reference: preview.draft,
    projectionFindings: preview.findings,
  });

  const sourceAvailable =
    preview.draft.technicalStatus.source.kind !== 'UNKNOWN';
  const technicalFindingCodes = preview.findings
    .filter((finding) => finding.code.startsWith('TECHNICAL_'))
    .map((finding) => finding.code)
    .sort();

  return {
    schemaVersion: EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION,
    classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
    officialReferenceCompared: false,
    paperReferenceRequired: true,
    comparisonBasis: 'SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS',
    notices: {
      officialLogbook: false,
      replacesPaper: false,
      containsSignature: false,
      persistsRegulatedRecord: false,
      authorizesReturnToService: false,
    },
    divergence,
    technicalStatus: {
      targetSchemaVersion: EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION,
      officialEffect: 'NONE',
      sourceAvailable,
      detailedContractLoaded: false,
      discrepancyDetailsAvailable: false,
      status: technicalAssessmentStatus(sourceAvailable, divergence),
      findingCodes: technicalFindingCodes,
    },
  };
}
