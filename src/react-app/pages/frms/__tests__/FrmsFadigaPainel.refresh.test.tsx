import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import FrmsFadigaPainel from '../FrmsFadigaPainel';

const mockState = vi.hoisted(() => ({
  daily: [{ funcionario_id: 10, funcionario_nome: 'Tripulante Sintético', status: 'normal', score_fadiga: 12 }],
  alerts: [] as Array<{ tripulante_id: number; id: string; nivel: string; mensagem: string }>,
  dailyCalls: 0,
  alertCalls: 0,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/react-app/components/Button', () => ({
  default: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) =>
    <button type="button" onClick={onClick}>{children}</button>,
}));
vi.mock('@/react-app/hooks/useFrms', () => ({
  useFrmsDailyFatigue: () => ({
    data: { items: mockState.daily },
    loading: false,
    refetch: () => {
      mockState.dailyCalls++;
      mockState.daily = [{
        funcionario_id: 10, funcionario_nome: 'Tripulante Sintético',
        status: 'normal', score_fadiga: 12,
      }];
    },
  }),
  useFrmsDailyFatigueAlerts: () => ({
    data: { items: mockState.alerts },
    loading: false,
    error: null,
    refetch: () => {
      mockState.alertCalls++;
      mockState.alerts = [{
        tripulante_id: 10, id: 'synthetic-risk', nivel: 'CRITICO',
        mensagem: 'Revisão operacional por fadiga calculada',
      }];
    },
  }),
  useFrmsFadigaAnalytics: () => ({ data: { serie: [] } }),
}));

describe('FRMS Monitor — atualização consistente de check-ins e alertas', () => {
  beforeEach(() => {
    mockState.daily = [{
      funcionario_id: 10, funcionario_nome: 'Tripulante Sintético',
      status: 'normal', score_fadiga: 12,
    }];
    mockState.alerts = [];
    mockState.dailyCalls = 0;
    mockState.alertCalls = 0;
  });

  it('reconsulta ambos ao clicar Atualizar e deixa de apresentar verde quando surge risco crítico', () => {
    const rendered = render(<FrmsFadigaPainel />);
    expect(screen.getByText('Preenchida — sem alerta identificado')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    rendered.rerender(<FrmsFadigaPainel />);

    expect(mockState.dailyCalls).toBe(1);
    expect(mockState.alertCalls).toBe(1);
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getAllByText('Crítica').length).toBeGreaterThan(0);
    expect(screen.queryByText('Preenchida — sem alerta identificado')).not.toBeInTheDocument();
  });
});
