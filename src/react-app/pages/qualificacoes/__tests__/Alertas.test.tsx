import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Alertas from '../Alertas';

const apiGet = vi.fn();

vi.mock('@/react-app/utils/api-client', () => ({
  api: { get: (...args: unknown[]) => apiGet(...args) },
}));

vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/react-app/components/PageHeader', () => ({
  default: ({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
      {actions}
    </header>
  ),
}));

vi.mock('../AlertasLegacy', () => ({
  default: () => <div>Administração de notificações legada</div>,
}));

describe('Qualificações — vencimentos e alertas', () => {
  beforeEach(() => {
    apiGet.mockReset();
    window.history.replaceState({}, '', '/qualificacoes/alertas');
  });

  it('carrega somente vencimentos na visão operacional e não espera serviços administrativos', async () => {
    apiGet.mockResolvedValue({
      success: true,
      data: {
        dias: 30,
        qualificacoes: [
          {
            id: 1,
            nome: 'CRM',
            categoria: 'Treinamento',
            data_vencimento: '2099-09-05',
          },
        ],
        licencas: [],
      },
    });

    render(<Alertas />);

    expect(screen.getByLabelText('Carregando vencimentos')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Vencimentos e alertas' })).toBeInTheDocument();
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(1));
    expect(apiGet).toHaveBeenCalledWith('/alertas/vencimentos');
    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configurar notificações/i })).toHaveAttribute(
      'href',
      '/qualificacoes/alertas?view=notificacoes',
    );
  });

  it('não transforma falha de consulta em zeros conhecidos', async () => {
    apiGet.mockRejectedValue(new Error('network down'));

    render(<Alertas />);

    expect(
      await screen.findByRole('heading', { name: 'Não foi possível carregar os vencimentos' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/não serão exibidos como zero/i)).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('mantém a administração completa acessível apenas quando solicitada', () => {
    window.history.replaceState({}, '', '/qualificacoes/alertas?view=notificacoes');

    render(<Alertas />);

    expect(screen.getByText('Administração de notificações legada')).toBeInTheDocument();
    expect(apiGet).not.toHaveBeenCalled();
  });
});
