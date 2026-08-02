import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EdbDraft } from '../../services/edb/domain-contracts';
import { loadEdbShadowPreview } from '../../services/edb/control-flight-shadow-preview';
import { loadEdbShadowPreliminaryAssessment } from '../../services/edb/control-flight-shadow-assessment';

vi.mock('../../services/edb/control-flight-shadow-preview', () => ({
  loadEdbShadowPreview: vi.fn(),
}));

function source(kind: 'AIRTRUST_CONTROL_FLIGHTS' | 'UNKNOWN' = 'AIRTRUST_CONTROL_FLIGHTS') {
  return kind === 'UNKNOWN' ? { kind } : { kind, reference: 'synthetic-reference' };
}

function draft(): EdbDraft {
  return {
    schemaVersion: 'edb.draft.v1',
    draftId: '00000000-0000-4000-8000-000000000042',
    tenantId: 7,
    status: 'shadow_draft',
    createdAt: '2026-08-02T14:00:00-03:00',
    sourceFlightReference: 'synthetic-flight-reference',
    operator: {
      legalName: 'Sensitive Operator',
      legalIdentifier: '00000000000000',
      operatingCertificate: null,
    },
    owner: { legalName: null, legalIdentifier: null },
    aircraft: {
      manufacturer: null,
      model: 'AW139',
      serialNumber: null,
      registration: 'PR-TST',
    },
    volumeNumber: null,
    legs: [],
    technicalStatus: {
      lastMaintenanceIntervention: null,
      nextMaintenanceIntervention: null,
      airframeHoursRemaining: null,
      returnToServiceReference: null,
      openDiscrepancyCount: null,
      source: source('UNKNOWN'),
    },
  };
}

describe('eDB preliminary shadow assessment', () => {
  beforeEach(() => {
    vi.mocked(loadEdbShadowPreview).mockReset();
  });

  it('runs completeness and projection findings without claiming an official comparison', async () => {
    vi.mocked(loadEdbShadowPreview).mockResolvedValue({
      draft: draft(),
      findings: [
        { code: 'TECHNICAL_STATUS_SOURCE_UNAVAILABLE', path: 'technicalStatus.source' },
        { code: 'SOURCE_CONFLICT_OPEN', path: 'conflicts.0' },
      ],
      fieldSources: [],
    });

    const assessment = await loadEdbShadowPreliminaryAssessment({} as D1Database, 7, 42);

    expect(loadEdbShadowPreview).toHaveBeenCalledWith(expect.anything(), 7, 42);
    expect(assessment).toMatchObject({
      schemaVersion: 'edb.shadow-assessment.v1',
      classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
      officialReferenceCompared: false,
      paperReferenceRequired: true,
      comparisonBasis: 'SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS',
      technicalStatus: {
        targetSchemaVersion: 'edb.technical-status.shadow.v1',
        officialEffect: 'NONE',
        sourceAvailable: false,
        detailedContractLoaded: false,
        discrepancyDetailsAvailable: false,
        status: 'source_unavailable',
      },
    });
    expect(assessment.divergence.metrics.projectionFindingCount).toBe(2);
    expect(assessment.divergence.metrics.completenessFindingCount).toBeGreaterThan(0);
    expect(assessment.divergence.evidence.fingerprint).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });

  it('returns only sanitized findings and aggregate metrics', async () => {
    vi.mocked(loadEdbShadowPreview).mockResolvedValue({
      draft: draft(),
      findings: [{ code: 'CREW_ROLE_UNMAPPED', path: 'legs.0.crew.0.function' }],
      fieldSources: [],
    });

    const serialized = JSON.stringify(
      await loadEdbShadowPreliminaryAssessment({} as D1Database, 7, 42),
    );

    expect(serialized).not.toContain('Sensitive Operator');
    expect(serialized).not.toContain('00000000000000');
    expect(serialized).not.toContain('synthetic-flight-reference');
    expect(serialized).not.toContain('PR-TST');
    expect(serialized).toContain('CREW_UNRESOLVED');
  });
});
