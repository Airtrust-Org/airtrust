import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import FrmsMaintenanceDashboard from '../FrmsMaintenanceDashboard';

const state = vi.hoisted(() => ({
  team: {
    data: null as unknown,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/FrmsWorkspaceNav', () => ({ default: () => null }));
vi.mock('@/react-app/hooks/useFrmsOperationalAccess', () => ({
  useFrmsOperationalAccess: () => ({
    isLoading: false, isError: false,
    data: { can_manage_maintenance: true, frms_profile: 'other' },
  }),
  useFrmsMaintenanceTeam: () => state.team,
}));

const validData = (items: unknown[]) => ({
  items,
  date: '2026-11-13',
  meta: { scope: 'maintenance', setor_ids: [6], access_source: 'tenant_admin' },
});
const pendingPerson = {
  funcionario_id: 36, funcionario_nome: 'Maria Silva', cargo: 'Mecânico',
  funcao: 'Mecânico', setor_id: 6, setor_nome: 'Manutenção',
  checkin_id: null, readiness_id: null, baseline_ready: 0,
};

describe('FRMS Manutenção — não confundir falha de leitura com ausência de risco', () => {
  beforeEach(() => {
    state.team = { data: null, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() };
  });

  it('trata erro com resposta antiga em memória como indisponibilidade, nunca verde/zero', () => {
    state.team.data = validData([pendingPerson]);
    state.team.isError = true;
    state.team.error = new Error('HTTP 503');
    render(<FrmsMaintenanceDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar a equipe de manutenção.');
    expect(screen.getByText(/Erro de consulta ou resposta inválida não comprovam ausência/)).toBeInTheDocument();
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum Mecânico ou Inspetor no escopo')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo de manutenção' })).not.toHaveTextContent('monitoramento normal0');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(state.team.refetch).toHaveBeenCalledOnce();
  });

  it('não reutiliza contagens verdes antigas enquanto consulta nova está em andamento', () => {
    state.team.data = validData([pendingPerson]);
    state.team.isFetching = true;
    render(<FrmsMaintenanceDashboard />);
    expect(screen.queryByText('Maria Silva')).not.toBeInTheDocument();
    expect(screen.queryByText('Nenhum Mecânico ou Inspetor no escopo')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Resumo de manutenção' })).toHaveTextContent('—');
  });

  it('rejeita estrutura incompleta da API mesmo sem sinal de erro HTTP', () => {
    state.team.data = { items: [], meta: {} };
    render(<FrmsMaintenanceDashboard />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível confirmar a equipe de manutenção.');
    expect(screen.queryByText('Nenhum Mecânico ou Inspetor no escopo')).not.toBeInTheDocument();
  });

  it('exibe equipe vazia somente quando resposta é válida e foi confirmada', () => {
    state.team.data = validData([]);
    render(<FrmsMaintenanceDashboard />);
    expect(screen.getByText('Nenhum Mecânico ou Inspetor no escopo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('mostra pendências reais e não classifica ausência de check-in como normal', () => {
    state.team.data = validData([pendingPerson]);
    render(<FrmsMaintenanceDashboard />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Evidência insuficiente', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
