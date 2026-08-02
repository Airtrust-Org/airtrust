import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEdbShadowReviewEvidence,
  EdbShadowReviewEvidenceError,
} from '../../services/edb/shadow-review-evidence';

const { loadAssessmentMock } = vi.hoisted(() => ({
  loadAssessmentMock: vi.fn(),
}));

vi.mock('../../services/edb/control-flight-shadow-assessment', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/edb/control-flight-shadow-assessment')>();
  return {
    ...actual,
    loadEdbShadowPreliminaryAssessment: loadAssessmentMock,
  };
});

function assessment(recommendation: 'continue' | 'review' | 'stop' = 'review') {
  return {
    schemaVersion: 'edb.shadow-assessment.v1',
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
    divergence: {
      recommendation,
      maxSeverity: recommendation === 'stop' ? 'CRITICAL' : 'HIGH',
      findings: [],
      metrics: {
        comparisonFieldCount: 20,
        matchingFieldCount: 19,
        divergenceCount: 1,
        completenessFindingCount: 1,
        projectionFindingCount: 0,
        unknownFieldCount: 0,
      },
      readiness: {
        score: recommendation === 'stop' ? 0 : 59,
        status: recommendation === 'stop' ? 'not_ready' : 'review',
        fieldAgreementPercent: 95,
        completenessPercent: 95,
      },
      evidence: { fingerprint: 'fnv1a32:1234abcd' },
    },
    technicalStatus: {
      targetSchemaVersion: 'edb.technical-status.shadow.v1',
      officialEffect: 'NONE',
      sourceAvailable: false,
      detailedContractLoaded: false,
      discrepancyDetailsAvailable: false,
      status: 'source_unavailable',
      findingCodes: ['TECHNICAL_STATUS_SOURCE_UNAVAILABLE'],
    },
  };
}

function review() {
  return {
    outcome: 'needs_correction' as const,
    paperComparison: 'compared_divergence_found' as const,
    usability: 'minor_friction' as const,
    reviewDurationSeconds: 180,
    selectedFindingCodes: ['TIMEZONE_ERROR', 'TIMEZONE_ERROR', 'SOURCE_MISSING'],
    acknowledgments: {
      paperRemainsOfficial: true as const,
      notASignature: true as const,
      noReturnToService: true as const,
      exportToAuthorizedRepository: true as const,
    },
  };
}

beforeEach(() => {
  loadAssessmentMock.mockReset();
  loadAssessmentMock.mockResolvedValue(assessment());
});

describe('shadow review evidence', () => {
  it('builds a sanitized export envelope without persistence or signature', async () => {
    const evidence = await createEdbShadowReviewEvidence({
      db: {} as D1Database,
      tenantId: 7,
      userId: 99,
      flightId: 42,
      review: review(),
      now: new Date('2026-08-02T18:30:00.000Z'),
      randomUuid: () => '00000000-0000-4000-8000-000000000777',
    });

    expect(loadAssessmentMock).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(evidence).toMatchObject({
      schemaVersion: 'edb.shadow-review-evidence.v1',
      classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE',
      evidenceId: '00000000-0000-4000-8000-000000000777',
      generatedAt: '2026-08-02T18:30:00.000Z',
      review: {
        outcome: 'needs_correction',
        paperComparison: 'compared_divergence_found',
        reviewDurationSeconds: 180,
        selectedFindingCodes: ['SOURCE_MISSING', 'TIMEZONE_ERROR'],
      },
      notices: {
        officialLogbook: false,
        replacesPaper: false,
        containsSignature: false,
        persistsInAirTrust: false,
        persistsRegulatedRecord: false,
        authorizesReturnToService: false,
        officialReferenceContentIncluded: false,
        exportRequired: true,
      },
    });
    expect(evidence.reviewerReference).toMatch(/^reviewer:fnv1a32:[0-9a-f]{8}$/);
    expect(evidence.flightReference).toMatch(/^flight:fnv1a32:[0-9a-f]{8}$/);
    expect(evidence.integrityFingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it('blocks continuing without paper comparison', async () => {
    await expect(
      createEdbShadowReviewEvidence({
        db: {} as D1Database,
        tenantId: 7,
        userId: 99,
        flightId: 42,
        review: {
          ...review(),
          outcome: 'continue',
          paperComparison: 'not_compared',
        },
      }),
    ).rejects.toEqual(new EdbShadowReviewEvidenceError('PAPER_COMPARISON_REQUIRED', 409));
  });

  it('blocks continuing when the assessment requires interruption', async () => {
    loadAssessmentMock.mockResolvedValue(assessment('stop'));
    await expect(
      createEdbShadowReviewEvidence({
        db: {} as D1Database,
        tenantId: 7,
        userId: 99,
        flightId: 42,
        review: {
          ...review(),
          outcome: 'continue',
          paperComparison: 'compared_no_material_divergence',
        },
      }),
    ).rejects.toEqual(new EdbShadowReviewEvidenceError('ASSESSMENT_REQUIRES_STOP', 409));
  });
});
