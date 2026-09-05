import { describe, expect, it } from 'vitest';
import {
  summarizeEdbShadowReadiness,
  type EdbShadowReadinessAssessment,
} from '../edbShadowReadiness';

function assessment(
  overrides: Partial<EdbShadowReadinessAssessment> = {},
): EdbShadowReadinessAssessment {
  return {
    classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
    officialReferenceCompared: false,
    paperReferenceRequired: true,
    notices: {
      officialLogbook: false,
      replacesPaper: false,
      containsSignature: false,
      persistsRegulatedRecord: false,
      authorizesReturnToService: false,
    },
    divergence: {
      caseResult: 'matched',
      recommendation: 'continue',
      maxSeverity: 'NONE',
      findings: [],
      readiness: {
        score: 100,
        status: 'ready',
        fieldAgreementPercent: 100,
        completenessPercent: 100,
      },
    },
    technicalStatus: {
      sourceAvailable: true,
      detailedContractLoaded: false,
      discrepancyDetailsAvailable: false,
      officialEffect: 'NONE',
      status: 'preliminarily_available',
      findingCodes: [],
    },
    ...overrides,
  };
}

describe('summarizeEdbShadowReadiness', () => {
  it('reports an available preliminary shadow without creating official effects', () => {
    const result = summarizeEdbShadowReadiness(assessment());

    expect(result.tone).toBe('ok');
    expect(result.reviewRequired).toBe(false);
    expect(result.readinessScore).toBe(100);
    expect(result.completenessPercent).toBe(100);
  });

  it('requires review when technical source evidence is unavailable', () => {
    const base = assessment();
    const result = summarizeEdbShadowReadiness(
      assessment({
        technicalStatus: {
          ...base.technicalStatus,
          sourceAvailable: false,
          status: 'source_unavailable',
        },
      }),
    );

    expect(result.tone).toBe('warning');
    expect(result.reviewRequired).toBe(true);
    expect(result.technicalMessage).toMatch(/não disponível/i);
  });

  it('fails closed when the readiness engine recommends stop', () => {
    const base = assessment();
    const result = summarizeEdbShadowReadiness(
      assessment({
        divergence: {
          ...base.divergence,
          recommendation: 'stop',
          caseResult: 'interrupted',
          readiness: {
            ...base.divergence.readiness,
            status: 'not_ready',
            score: 35,
          },
          findings: [
            {
              category: 'TENANT_SCOPE_ERROR',
              severity: 'CRITICAL',
              causeCode: 'TENANT_SCOPE_ERROR',
              field: 'tenantId',
            },
          ],
        },
      }),
    );

    expect(result.tone).toBe('blocked');
    expect(result.reviewRequired).toBe(true);
    expect(result.findingCount).toBe(1);
    expect(result.readinessScore).toBe(35);
  });
});
