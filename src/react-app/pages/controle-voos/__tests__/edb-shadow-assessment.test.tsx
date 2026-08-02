import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '@/react-app/config/api';
import EdbShadowPrototypeWithAssessment from '../EdbShadowPrototypeWithAssessment';

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: vi.fn() }));
vi.mock('../EdbShadowPrototype', () => ({
  default: () => <div>Protótipo base</div>,
}));

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function assessmentPayload() {
  return {
    success: true,
    data: {
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
        recommendation: 'review',
        maxSeverity: 'HIGH',
        findings: [
          {
            category: 'FIELD_MISSING',
            severity: 'HIGH',
            causeCode: 'SOURCE_MISSING',
            field: 'aircraft.serialNumber',
          },
        ],
        metrics: {
          comparisonFieldCount: 20,
          matchingFieldCount: 20,
          divergenceCount: 1,
          completenessFindingCount: 1,
          projectionFindingCount: 0,
          unknownFieldCount: 0,
        },
        readiness: {
          score: 59,
          status: 'not_ready',
          fieldAgreementPercent: 100,
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
    },
  };
}

function renderPage(path = '/controle-voos?edb-shadow=1&flightId=42') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <EdbShadowPrototypeWithAssessment />
    </MemoryRouter>,
  );
}

describe('integração visual da avaliação shadow', () => {
  afterEach(() => vi.clearAllMocks());

  it('carrega avaliação sanitizada por GET e explica que o papel não foi comparado', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(response(assessmentPayload()));
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Avaliação preliminar — referência oficial ainda não comparada'),
      ).toBeInTheDocument(),
    );
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/edb/shadow-assessment/42', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    expect(screen.getByText('59%')).toBeInTheDocument();
    expect(screen.getByText('Revisão necessária')).toBeInTheDocument();
    expect(screen.getByText('Fonte técnica detalhada indisponível')).toBeInTheDocument();
    expect(screen.getByText('edb.technical-status.shadow.v1')).toBeInTheDocument();
    expect(screen.getByText(/papel permanece como fonte oficial/i)).toBeInTheDocument();
  });

  it('não consulta a avaliação sem um voo válido', () => {
    renderPage('/controle-voos?edb-shadow=1');
    expect(fetchWithAuth).not.toHaveBeenCalled();
    expect(screen.getByText(/carregue um voo para exibir/i)).toBeInTheDocument();
  });

  it('sanitiza indisponibilidade sem exibir resposta interna', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      response({ success: false, error: 'SQL secret', payload: { empresa_id: 7 } }, false, 500),
    );
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/avaliação preliminar indisponível/i)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/SQL secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/empresa_id/i)).not.toBeInTheDocument();
  });
});
