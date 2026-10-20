import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosMonthlyReportPreview from '../BombeirosMonthlyReportPreview';

const useApiMock = vi.fn();
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));
const report = {
  method_version: 'BOA_MONTHLY_EVIDENCE_PREVIEW_V1',
  state: 'UNSIGNED_UNVALIDATED_PREVIEW',
  basis: 'CHECKIN_MONTH_AND_CASE_STATUS_AT_GENERATION',
  coverage: 'NOT_DETERMINABLE_WITHOUT_ROSTER',
  current: {
    month: '2026-10', participants: 6, checkin_receipts: 12,
    cases: {
      opened: null, awaiting_treatment: null,
      under_treatment: null, closed_with_efficacy: null,
      privacy: 'SMALL_CELL_SUPPRESSED',
    },
  },
  previous: {
    month: '2026-09', participants: 6, checkin_receipts: 10,
    cases: {
      opened: 10, awaiting_treatment: 10, under_treatment: 0,
      closed_with_efficacy: 0, privacy: 'OBSERVED',
    },
  },
  receipt_delta: 2,
  managerial_recommendations: ['Verificar escalas antes de calcular cobertura.'],
  technical_caveats: ['Não demonstra índice validado de fadiga.'],
  provenance: {
    event_types: ['BOA_CHECKIN_V1'], signed: false, stored: false,
    scientific_score: 'NOT_VALIDATED',
  },
};
describe('BOA monthly managerial/technical report preview', () => {
  beforeEach(() => useApiMock.mockReset());

  it('does not show data to unauthorized users or call the offshore report endpoint', () => {
    useApiMock.mockReturnValue({
      data: null, error: '403', loading: false, refetch: vi.fn(),
    });
    render(<BombeirosMonthlyReportPreview />);
    expect(useApiMock.mock.calls[0][0]).toMatch(
      /^\/api\/bombeiros\/frms\/relatorios\/gerencial-tecnico-previa\?mes=/,
    );
    expect(useApiMock.mock.calls[0][1]).toMatchObject({
      requireAuth: true, bypassGetCache: true, staleTime: 0,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('403');
    expect(screen.queryByText('12')).not.toBeInTheDocument();
  });

  it('makes suppression and unsigned status unmistakable', () => {
    useApiMock.mockReturnValue({
      data: { success: true, data: report,
        meta: { policy_revision: 'boa-approved-r1', generated_at: '2026-10-20T23:00:00Z',
          signature: 'NOT_SIGNED' } },
      error: null, loading: false, refetch: vi.fn(),
    });
    render(<BombeirosMonthlyReportPreview />);
    expect(screen.getAllByText('Protegido / indisponível').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(/Rascunho não assinado/)).toBeInTheDocument();
    expect(screen.getByText(/Distribuição suprimida integralmente/)).toBeInTheDocument();
    expect(screen.getByText(/Não assinado · não arquivado/)).toBeInTheDocument();
    expect(screen.getByText(/Verificar escalas antes de calcular cobertura/)).toBeInTheDocument();
    expect(screen.getByText(/Não demonstra índice validado de fadiga/)).toBeInTheDocument();
    expect(screen.queryByText(/Apto para voo/)).not.toBeInTheDocument();
  });

  it('does not infer completeness when the source is unavailable', () => {
    useApiMock.mockReturnValue({
      data: null, error: null, loading: false, refetch: vi.fn(),
    });
    render(<BombeirosMonthlyReportPreview />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nenhum resultado foi presumido',
    );
  });
});
