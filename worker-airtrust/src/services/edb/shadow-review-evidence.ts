import { z } from 'zod';
import {
  EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION,
  loadEdbShadowPreliminaryAssessment,
} from './control-flight-shadow-assessment';
import { EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION } from './technical-status-shadow-contracts';

export const EDB_SHADOW_REVIEW_EVIDENCE_SCHEMA_VERSION =
  'edb.shadow-review-evidence.v1' as const;

export const edbShadowReviewInputSchema = z
  .object({
    outcome: z.enum(['continue', 'needs_correction', 'stop']),
    paperComparison: z.enum([
      'not_compared',
      'compared_no_material_divergence',
      'compared_divergence_found',
    ]),
    usability: z.enum(['clear', 'minor_friction', 'blocked']),
    reviewDurationSeconds: z.number().int().min(1).max(86400),
    selectedFindingCodes: z
      .array(z.string().regex(/^[A-Z0-9_]{1,100}$/))
      .max(100)
      .default([]),
    acknowledgments: z
      .object({
        paperRemainsOfficial: z.literal(true),
        notASignature: z.literal(true),
        noReturnToService: z.literal(true),
        exportToAuthorizedRepository: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.outcome === 'continue' && value.paperComparison === 'not_compared') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['paperComparison'],
        message: 'A comparação com o papel é obrigatória antes de continuar.',
      });
    }
  });

export type EdbShadowReviewInput = z.infer<typeof edbShadowReviewInputSchema>;

export interface EdbShadowReviewEvidence {
  schemaVersion: typeof EDB_SHADOW_REVIEW_EVIDENCE_SCHEMA_VERSION;
  classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE';
  evidenceId: string;
  generatedAt: string;
  caseReference: string;
  reviewerReference: string;
  flightReference: string;
  contracts: {
    draft: 'edb.draft.v1';
    assessment: typeof EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION;
    technicalStatus: typeof EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION;
  };
  review: {
    outcome: EdbShadowReviewInput['outcome'];
    paperComparison: EdbShadowReviewInput['paperComparison'];
    usability: EdbShadowReviewInput['usability'];
    reviewDurationSeconds: number;
    selectedFindingCodes: string[];
  };
  assessment: {
    fingerprint: string;
    recommendation: 'continue' | 'review' | 'stop';
    readinessScore: number;
    readinessStatus: 'ready' | 'review' | 'not_ready';
    maxSeverity: 'NONE' | 'OBSERVATION' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    technicalStatus: 'source_unavailable' | 'requires_review' | 'preliminarily_available';
  };
  notices: {
    officialLogbook: false;
    replacesPaper: false;
    containsSignature: false;
    persistsInAirTrust: false;
    persistsRegulatedRecord: false;
    authorizesReturnToService: false;
    officialReferenceContentIncluded: false;
    exportRequired: true;
  };
  integrityFingerprint: string;
}

export class EdbShadowReviewEvidenceError extends Error {
  constructor(
    public readonly code: 'ASSESSMENT_REQUIRES_STOP' | 'PAPER_COMPARISON_REQUIRED',
    public readonly status: 409,
  ) {
    super(code);
    this.name = 'EdbShadowReviewEvidenceError';
  }
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function pseudonymousReference(namespace: string, tenantId: number, value: number): string {
  return `${namespace}:${fnv1a32(`${tenantId}:${value}`)}`;
}

export async function createEdbShadowReviewEvidence(input: {
  db: D1Database;
  tenantId: number;
  userId: number;
  flightId: number;
  review: EdbShadowReviewInput;
  now?: Date;
  randomUuid?: () => string;
}): Promise<EdbShadowReviewEvidence> {
  const assessment = await loadEdbShadowPreliminaryAssessment(
    input.db,
    input.tenantId,
    input.flightId,
  );

  if (input.review.paperComparison === 'not_compared' && input.review.outcome === 'continue') {
    throw new EdbShadowReviewEvidenceError('PAPER_COMPARISON_REQUIRED', 409);
  }
  if (assessment.divergence.recommendation === 'stop' && input.review.outcome === 'continue') {
    throw new EdbShadowReviewEvidenceError('ASSESSMENT_REQUIRES_STOP', 409);
  }

  const generatedAt = (input.now ?? new Date()).toISOString();
  const evidenceId = (input.randomUuid ?? (() => crypto.randomUUID()))();
  const selectedFindingCodes = [...new Set(input.review.selectedFindingCodes)].sort();
  const evidenceWithoutIntegrity = {
    schemaVersion: EDB_SHADOW_REVIEW_EVIDENCE_SCHEMA_VERSION,
    classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE' as const,
    evidenceId,
    generatedAt,
    caseReference: `case:${fnv1a32(
      `${input.tenantId}:${input.flightId}:${assessment.divergence.evidence.fingerprint}`,
    )}`,
    reviewerReference: pseudonymousReference('reviewer', input.tenantId, input.userId),
    flightReference: pseudonymousReference('flight', input.tenantId, input.flightId),
    contracts: {
      draft: 'edb.draft.v1' as const,
      assessment: EDB_SHADOW_ASSESSMENT_SCHEMA_VERSION,
      technicalStatus: EDB_TECHNICAL_STATUS_SHADOW_SCHEMA_VERSION,
    },
    review: {
      outcome: input.review.outcome,
      paperComparison: input.review.paperComparison,
      usability: input.review.usability,
      reviewDurationSeconds: input.review.reviewDurationSeconds,
      selectedFindingCodes,
    },
    assessment: {
      fingerprint: assessment.divergence.evidence.fingerprint,
      recommendation: assessment.divergence.recommendation,
      readinessScore: assessment.divergence.readiness.score,
      readinessStatus: assessment.divergence.readiness.status,
      maxSeverity: assessment.divergence.maxSeverity,
      technicalStatus: assessment.technicalStatus.status,
    },
    notices: {
      officialLogbook: false as const,
      replacesPaper: false as const,
      containsSignature: false as const,
      persistsInAirTrust: false as const,
      persistsRegulatedRecord: false as const,
      authorizesReturnToService: false as const,
      officialReferenceContentIncluded: false as const,
      exportRequired: true as const,
    },
  };

  return {
    ...evidenceWithoutIntegrity,
    integrityFingerprint: fnv1a32(JSON.stringify(evidenceWithoutIntegrity)),
  };
}
