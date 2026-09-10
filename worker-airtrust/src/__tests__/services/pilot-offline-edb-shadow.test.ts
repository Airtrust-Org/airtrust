import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const { loadPreviewMock, loadAssessmentMock } = vi.hoisted(() => ({
  loadPreviewMock: vi.fn(),
  loadAssessmentMock: vi.fn(),
}));

vi.mock('../../services/edb/control-flight-shadow-preview', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/edb/control-flight-shadow-preview')>();
  return {
    ...actual,
    loadEdbShadowPreview: loadPreviewMock,
  };
});

vi.mock('../../services/edb/control-flight-shadow-assessment', () => ({
  loadEdbShadowPreliminaryAssessment: loadAssessmentMock,
}));

import { EdbShadowPreviewError } from '../../services/edb/control-flight-shadow-preview';
import { loadPilotOfflineEdbShadow } from '../../services/controle-voos/pilot-offline-edb-shadow';

function env(
  environment: 'development' | 'staging' | 'production',
  tenants = '7',
): Env {
  return {
    DB: {} as D1Database,
    ENVIRONMENT: environment,
    EDB_SHADOW_PILOT_TENANTS: tenants,
  } as unknown as Env;
}

const preview = {
  draft: {
    status: 'shadow_draft',
    schemaVersion: 'edb.draft.v1',
    draftId: 'draft-42',
    tenantId: 7,
    createdAt: '2026-09-09T20:00:00.000Z',
    sourceFlightReference: 'cv_voos:42',
    legs: [],
  },
  findings: [{ code: 'TIMEZONE_REQUIRED', path: 'legs.0.timezone' }],
  fieldSources: [],
};

const assessment = {
  schemaVersion: 'edb.shadow-assessment.v1',
  classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT',
  officialReferenceCompared: false,
  paperReferenceRequired: true,
  divergence: {
    readiness: {
      score: 72,
      status: 'review',
      fieldAgreementPercent: 100,
      completenessPercent: 72,
    },
    recommendation: 'review',
    maxSeverity: 'MEDIUM',
  },
  technicalStatus: {
    officialEffect: 'NONE',
    sourceAvailable: false,
    status: 'source_unavailable',
  },
};

describe('Pilot offline eDB shadow adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadPreviewMock.mockResolvedValue(preview);
    loadAssessmentMock.mockResolvedValue(assessment);
  });

  it('fica desabilitado fora de staging sem consultar a projeção', async () => {
    const result = await loadPilotOfflineEdbShadow({
      env: env('production'),
      tenantId: 7,
      flightId: 42,
      generatedAt: '2026-09-09T20:00:00.000Z',
    });

    expect(result).toMatchObject({
      state: 'DISABLED',
      reason: 'SHADOW_PILOT_DISABLED',
      contract: {
        classification: 'NON_OFFICIAL_SHADOW',
        official_logbook: false,
        replaces_paper: false,
        contains_signature: false,
        persists_regulated_record: false,
        authorizes_return_to_service: false,
      },
    });
    expect(loadPreviewMock).not.toHaveBeenCalled();
    expect(loadAssessmentMock).not.toHaveBeenCalled();
  });

  it('reusa preview e assessment somente no tenant staging allowlisted', async () => {
    const result = await loadPilotOfflineEdbShadow({
      env: env('staging', '6,7'),
      tenantId: 7,
      flightId: 42,
      generatedAt: '2026-09-09T20:00:00.000Z',
    });

    expect(result).toMatchObject({
      state: 'AVAILABLE',
      reason: null,
      preview: {
        status: 'shadow_draft',
        schema_version: 'edb.draft.v1',
        findings: [{ code: 'TIMEZONE_REQUIRED', path: 'legs.0.timezone' }],
      },
      assessment: {
        schema_version: 'edb.shadow-assessment.v1',
        official_reference_compared: false,
        paper_reference_required: true,
        recommendation: 'review',
        max_severity: 'MEDIUM',
      },
    });
    expect(loadPreviewMock).toHaveBeenCalledWith(
      expect.anything(),
      7,
      42,
      { createdAt: '2026-09-09T20:00:00.000Z' },
    );
    expect(loadAssessmentMock).toHaveBeenCalledWith(expect.anything(), 7, 42);
  });

  it('sanitiza falha da projeção sem incluir a mensagem original', async () => {
    loadPreviewMock.mockRejectedValueOnce(
      new EdbShadowPreviewError('FLIGHT_NOT_FOUND', 404),
    );

    const result = await loadPilotOfflineEdbShadow({
      env: env('staging'),
      tenantId: 7,
      flightId: 42,
      generatedAt: '2026-09-09T20:00:00.000Z',
    });

    expect(result).toMatchObject({
      state: 'UNAVAILABLE',
      reason: 'SHADOW_PREVIEW_FLIGHT_NOT_FOUND',
      preview: null,
      assessment: null,
    });
    expect(JSON.stringify(result)).not.toContain('Voo');
  });

  it('preserva o preview quando somente o assessment fica indisponível', async () => {
    loadAssessmentMock.mockRejectedValueOnce(new Error('raw database detail'));

    const result = await loadPilotOfflineEdbShadow({
      env: env('staging'),
      tenantId: 7,
      flightId: 42,
      generatedAt: '2026-09-09T20:00:00.000Z',
    });

    expect(result).toMatchObject({
      state: 'AVAILABLE_PARTIAL',
      reason: 'SHADOW_ASSESSMENT_UNAVAILABLE',
      preview: {
        status: 'shadow_draft',
      },
      assessment: null,
    });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
  });
});
