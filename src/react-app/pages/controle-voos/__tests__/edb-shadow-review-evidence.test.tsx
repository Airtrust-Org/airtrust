import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithAuth } from '@/react-app/config/api';
import EdbShadowReviewEvidencePanel from '../EdbShadowReviewEvidencePanel';

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: vi.fn() }));

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function evidencePayload() {
  return {
    success: true,
    data: {
      schemaVersion: 'edb.shadow-review-evidence.v1',
      classification: 'NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE',
      evidenceId: '00000000-0000-4000-8000-000000000777',
      generatedAt: '2026-08-02T18:30:00.000Z',
      caseReference: 'case:fnv1a32:1234abcd',
      reviewerReference: 'reviewer:fnv1a32:1234abcd',
      flightReference: 'flight:fnv1a32:1234abcd',
      contracts: {
        draft: 'edb.draft.v1',
        assessment: 'edb.shadow-assessment.v1',
        technicalStatus: 'edb.technical-status.shadow.v1',
      },
      review: {
        outcome: 'needs_correction',
        paperComparison: 'not_compared',
        usability: 'clear',
        reviewDurationSeconds: 300,
        selectedFindingCodes: [],
      },
      assessment: {
        fingerprint: 'fnv1a32:1234abcd',
        recommendation: 'review',
        readinessScore: 59,
        readinessStatus: 'review',
        maxSeverity: 'HIGH',
        technicalStatus: 'source_unavailable',
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
      integrityFingerprint: 'fnv1a32:abcd1234',
    },
  };
}

function acknowledgeRequiredStatements() {
  fireEvent.click(screen.getByLabelText('O Diário de Bordo em papel permanece oficial.'));
  fireEvent.click(screen.getByLabelText('Esta ação não é assinatura nem ciência oficial do PIC.'));
  fireEvent.click(
    screen.getByLabelText('Esta ação não autoriza retorno ao serviço ou liberação de voo.'),
  );
  fireEvent.click(
    screen.getByLabelText('A evidência será armazenada somente em repositório autorizado.'),
  );
}

describe('EdbShadowReviewEvidencePanel', () => {
  afterEach(() => vi.clearAllMocks());

  it('não apresenta o fluxo sem um voo válido', () => {
    const { container } = render(<EdbShadowReviewEvidencePanel flightId="" />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('bloqueia a continuidade antes da comparação com o papel oficial', () => {
    render(<EdbShadowReviewEvidencePanel flightId="42" />);

    fireEvent.change(screen.getByLabelText('Resultado'), { target: { value: 'continue' } });
    acknowledgeRequiredStatements();

    expect(
      screen.getByText('Não é possível continuar o caso antes da comparação com o papel oficial.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gerar evidência não oficial' })).toBeDisabled();
    expect(fetchWithAuth).not.toHaveBeenCalled();
  });

  it('gera somente evidência exportável e não persistente por POST autenticado', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(response(evidencePayload()));
    render(<EdbShadowReviewEvidencePanel flightId="42" />);
    acknowledgeRequiredStatements();

    const submit = screen.getByRole('button', { name: 'Gerar evidência não oficial' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledTimes(1));
    const [path, request] = vi.mocked(fetchWithAuth).mock.calls[0];
    expect(path).toBe('/api/edb/shadow-review/42/evidence');
    expect(request).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
    expect(JSON.parse(String(request?.body))).toEqual({
      outcome: 'needs_correction',
      paperComparison: 'not_compared',
      usability: 'clear',
      reviewDurationSeconds: 300,
      selectedFindingCodes: [],
      acknowledgments: {
        paperRemainsOfficial: true,
        notASignature: true,
        noReturnToService: true,
        exportToAuthorizedRepository: true,
      },
    });

    expect(
      await screen.findByText(
        /Evidência gerada sem persistência no AirTrust\. Identificador: 00000000-0000-4000-8000-000000000777/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar evidência JSON' })).toBeInTheDocument();
  });

  it('sanitiza falhas sem exibir payload interno', async () => {
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(
      response({ success: false, error: 'SQL secret', empresa_id: 7 }, false, 500),
    );
    render(<EdbShadowReviewEvidencePanel flightId="42" />);
    acknowledgeRequiredStatements();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar evidência não oficial' }));

    expect(
      await screen.findByText(
        /Não foi possível gerar a evidência\. Nenhum registro foi alterado\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/SQL secret/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/empresa_id/i)).not.toBeInTheDocument();
  });
});
