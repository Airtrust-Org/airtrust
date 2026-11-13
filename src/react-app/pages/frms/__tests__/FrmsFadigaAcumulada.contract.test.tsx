import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FrmsFadigaAcumulada from '../FrmsFadigaAcumulada';
import type { ReactNode } from 'react';

const { useApiMock, retryFleet, retryIndividual } = vi.hoisted(() => ({
  useApiMock: vi.fn(),
  retryFleet: vi.fn(),
  retryIndividual: vi.fn(),
}));

vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

function fleetData(rows: unknown[]) {
  return {
    success: true,
    data: {
      frota: rows,
      resumo: { total_tripulantes: rows.length, em_alerta: 0, criticos: 0, incompletos: 0, violacoes: 0 },
      thresholds: { verde: 80, amarelo: 90, vermelho: 95 },
      limites: { trabalho_mensal_horas: 176, trabalho_7d_horas: null, trabalho_14d_horas: null, jornada_horas: 176, voo_horas: 90 },
    },
  };
}

const piloto = {
  tripulante_id: '111', nome: 'QA Piloto Sintético', funcao: 'Piloto',
  alerta: 'normal', trabalho_status: 'COMPLETE', trabalho_horas: 8,
  pct_trabalho: 4.5, voo_horas: 2, pct_voo: 2.2,
  dias_jornada: 1, dia_ciclo: null,
};

describe('FRMS acumulado legal — contrato real success/data e falha segura', () => {
  beforeEach(() => {
    useApiMock.mockReset();
    retryFleet.mockReset();
    retryIndividual.mockReset();
    useApiMock.mockImplementation((path: string) => path?.includes('/frota?')
      ? { data: fleetData([piloto]), loading: false, error: null, refetch: retryFleet }
      : { data: null, loading: false, error: null, refetch: retryIndividual });
  });

  it('reconhece envelope preservado e mostra o tripulante retornado, não lista vazia', () => {
    render(<FrmsFadigaAcumulada />);
    expect(screen.getByText('QA Piloto Sintético')).toBeInTheDocument();
    expect(screen.getByText('Tripulantes')).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma jornada registrada/)).not.toBeInTheDocument();
    expect(useApiMock).toHaveBeenCalledWith(expect.stringContaining('/frota?'),
      expect.objectContaining({ preserveEnvelope: true, bypassGetCache: true }));
  });

  it('esconde resultado verde cacheado quando GET falha e oferece retry', () => {
    useApiMock.mockImplementation((path: string) => path?.includes('/frota?')
      ? { data: fleetData([piloto]), loading: false, error: 'HTTP 503', refetch: retryFleet }
      : { data: null, loading: false, error: null, refetch: retryIndividual });
    render(<FrmsFadigaAcumulada />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar o acumulado legal.');
    expect(screen.queryByText('QA Piloto Sintético')).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma jornada registrada/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retryFleet).toHaveBeenCalledOnce();
  });

  it('não interpreta resposta nula/malformada como zero jornadas', () => {
    useApiMock.mockImplementation((path: string) => path?.includes('/frota?')
      ? { data: null, loading: false, error: null, refetch: retryFleet }
      : { data: null, loading: false, error: null, refetch: retryIndividual });
    render(<FrmsFadigaAcumulada />);
    expect(screen.getByRole('alert')).toHaveTextContent(/resposta inválida não comprovam ausência de jornadas/);
    expect(screen.queryByText(/Nenhuma jornada registrada/)).not.toBeInTheDocument();
  });

  it('respeita zero jornadas apenas quando backend retorna lista vazia válida', () => {
    useApiMock.mockImplementation((path: string) => path?.includes('/frota?')
      ? { data: fleetData([]), loading: false, error: null, refetch: retryFleet }
      : { data: null, loading: false, error: null, refetch: retryIndividual });
    render(<FrmsFadigaAcumulada />);
    expect(screen.getByText(/Nenhuma jornada registrada/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('não apresenta evolução como ausente se detalhe de tripulante retorna erro', () => {
    useApiMock.mockImplementation((path: string) => path?.includes('/frota?')
      ? { data: fleetData([piloto]), loading: false, error: null, refetch: retryFleet }
      : { data: { success: true, data: { evolucao: [] } }, loading: false, error: 'HTTP 503', refetch: retryIndividual });
    render(<FrmsFadigaAcumulada />);
    fireEvent.click(screen.getByRole('button', { name: /QA Piloto Sintético/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar a evolução operacional deste tripulante.');
    expect(screen.queryByText(/Não há evolução operacional elegível neste período/)).not.toBeInTheDocument();
    expect(useApiMock).toHaveBeenCalledWith(expect.stringContaining('tripulante_id=111'),
      expect.objectContaining({ preserveEnvelope: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retryIndividual).toHaveBeenCalledOnce();
  });
});
