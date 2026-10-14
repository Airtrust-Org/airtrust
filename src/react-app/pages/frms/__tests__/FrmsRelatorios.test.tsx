import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsRelatorios, { csvCell } from '../FrmsRelatorios';

const useApiMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('FrmsRelatorios', () => {
  beforeEach(() => {
    useApiMock.mockReset();
    refetchMock.mockReset();
  });

  it('neutraliza células que poderiam ser interpretadas como fórmula no CSV', () => {
    expect(csvCell('=HYPERLINK("https://evil.invalid")')).toBe('"\'=HYPERLINK(""https://evil.invalid"")"');
    expect(csvCell('+SUM(1,1)')).toBe('"\'+SUM(1,1)"');
    expect(csvCell('texto normal')).toBe('"texto normal"');
  });

  it('encerra o carregamento com erro explícito e permite tentar novamente', () => {
    useApiMock.mockReturnValue({
      data: null,
      loading: false,
      error: 'HTTP 500 — falha interna',
      refetch: refetchMock,
    });

    render(<FrmsRelatorios />);

    expect(screen.getByText('Não foi possível gerar este relatório')).toBeInTheDocument();
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it('explica conclusões, providências e limitações usando apenas os registros da consulta', () => {
    useApiMock.mockReturnValue({
      data: {
        success: true,
        data: [
          { tripulante_id: 1, nome: 'QA Um', dias_avaliados: 10, dias_violacao: 1, dias_nao_avaliados: 0 },
          { tripulante_id: 2, nome: 'QA Dois', dias_avaliados: 9, dias_violacao: 0, dias_nao_avaliados: 1 },
        ],
        meta: { policy_version: 'QA', revision_id: 'rev', source: 'fixture', limitations: ['Dados sintéticos'] },
      },
      loading: false, error: null, refetch: refetchMock,
    });
    render(<FrmsRelatorios />);
    expect(screen.getByRole('region', { name: /Conclusões e próximas ações/i })).toBeInTheDocument();
    expect(screen.getByText(/1 profissional\(is\) com dias de violação/i)).toBeInTheDocument();
    expect(screen.getByText(/Limitações da fonte: Dados sintéticos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeEnabled();
  });

  it('não apresenta campos ausentes como zero ou nível verde no consolidado', () => {
    useApiMock.mockReturnValue({
      data: {
        success: true, data: [{ tripulante_id: 1, nome: 'QA Sem Dados', nivel_max: null, repouso_suficiente: null }],
        meta: { policy_version: 'QA', revision_id: 'rev', source: 'fixture', limitations: [] },
      }, loading: false, error: null, refetch: refetchMock,
    });
    render(<FrmsRelatorios />);
    fireEvent.click(screen.getByRole('button', { name: /Resumo de consumo de limites/i }));
    expect(screen.getAllByText('Não avaliado').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/nível ou repouso desconhecido/i)).toBeInTheDocument();
  });

  it('não habilita exportação quando a resposta não traz metadados de governança', () => {
    useApiMock.mockReturnValue({
      data: [{ tripulante_id: 1, nome: 'Tripulante Teste', dias_avaliados: 1 }],
      loading: false,
      error: null,
      refetch: refetchMock,
    });

    render(<FrmsRelatorios />);

    expect(screen.getByRole('button', { name: 'CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeDisabled();
  });
});
