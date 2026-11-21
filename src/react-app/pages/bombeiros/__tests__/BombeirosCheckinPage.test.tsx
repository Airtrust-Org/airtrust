import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosCheckinPage from '../BombeirosCheckinPage';

const useAuthMock = vi.fn();
const mutateMock = vi.fn();
const statusApiMock = vi.fn();
const refetchMock = vi.fn();
vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@/react-app/hooks/useApi', () => ({
  useApiMutation: () => ({ mutate: mutateMock, loading: false, error: null }),
  useApi: (...args: unknown[]) => statusApiMock(...args),
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const setCompany = (id: number, code: string, role = 'ALUNO') =>
  useAuthMock.mockReturnValue({
    empresas: [{ id, codigo: code }], empresaAtualId: id, user: { role },
  });

describe('BOA checkin form — own tenant and zero offshore scope', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    statusApiMock.mockReset().mockReturnValue({
      data: { success: true, data: { received: false, checkin_id: null,
        case_id: null, human_review_required: true, dispatch_permission: 'NOT_GRANTED' } },
      error: null, loading: false, refetch: refetchMock,
    });
    refetchMock.mockReset();
    mutateMock.mockReset().mockResolvedValue({
      accepted: true, checkin_id: 'qa-receipt', case_id: 'qa-case',
      status: 'HUMAN_REVIEW_REQUIRED', dispatch_permission: 'NOT_GRANTED',
      method_version: 'BOA_EVIDENCE_INTAKE_V1',
    });
  });

  it('does not render BOA self-report form under Costa do Sol', () => {
    setCompany(6, 'costadosol');
    render(<BombeirosCheckinPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('exclusivo da tripulação');
    expect(screen.queryByRole('button', { name: 'Enviar para revisão humana' })).not.toBeInTheDocument();
  });

  it('does not let admins file arbitrary employee check-ins', () => {
    setCompany(130, 'bombeiros', 'ADMINISTRADOR');
    render(<BombeirosCheckinPage />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('states that 60-second PVT completion is only a declaration, not cognitive measurement', () => {
    setCompany(130, 'bombeiros');
    render(<BombeirosCheckinPage />);
    expect(screen.getByText(/não executa um PVT nem registra tempos de reação/i)).toBeInTheDocument();
    expect(screen.getByText(/não equivale automaticamente ao PVT-B de três minutos/i)).toBeInTheDocument();
    expect(screen.getByText(/sono e a KSS são autorrelatos/i)).toBeInTheDocument();
  });

  it('requires confidentiality acknowledgement before sending the isolated BOA payload', async () => {
    setCompany(130, 'bombeiros');
    render(<BombeirosCheckinPage />);
    expect(screen.getByRole('button', { name: 'Enviar para revisão humana' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Período da missão'), { target: { value: 'NOTURNO' } });
    fireEvent.change(screen.getByLabelText('Horas de sono em 24 horas'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Sonolência KSS'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Confirmar ciência e confidencialidade'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para revisão humana' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledOnce());
    const [path, options] = mutateMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/bombeiros/frms/checkin');
    const data = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(data).toMatchObject({
      mission_type: 'RESGATE', duty_period: 'NOTURNO',
      sleep_hours_24h: 4, kss_reported: 8, acknowledge_confidentiality: true,
    });
    expect(data).not.toHaveProperty('empresa_id');
    expect(data).not.toHaveProperty('funcionario_id');
    expect(data).not.toHaveProperty('apto');
    expect(data).not.toHaveProperty('score_fadiga');
    expect(await screen.findByText('qa-case')).toBeInTheDocument();
    expect(screen.getByText(/não concedida/)).toBeInTheDocument();
  });

  it('does not post a duplicate or invent clearance after a prior accepted BOA receipt', () => {
    setCompany(130, 'bombeiros');
    statusApiMock.mockReturnValue({
      data: { success: true, data: {
        received: true, checkin_id: 'boa-existing', case_id: 'boa-case-existing',
        human_review_required: true, dispatch_permission: 'NOT_GRANTED',
      } },
      loading: false, error: null, refetch: refetchMock,
    });
    render(<BombeirosCheckinPage />);
    fireEvent.click(screen.getByLabelText('Confirmar ciência e confidencialidade'));
    expect(screen.getByRole('button', { name: 'Enviar para revisão humana' })).toBeDisabled();
    expect(screen.getByText(/Check-in do dia já recebido/)).toBeInTheDocument();
    expect(screen.getByText(/boa-case-existing/)).toBeInTheDocument();
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('blocks sending when prior receipt status cannot be verified', () => {
    setCompany(130, 'bombeiros');
    statusApiMock.mockReturnValue({ data: null, loading: false,
      error: 'integrity failed', refetch: refetchMock });
    render(<BombeirosCheckinPage />);
    fireEvent.click(screen.getByLabelText('Confirmar ciência e confidencialidade'));
    expect(screen.getByRole('button', { name: 'Enviar para revisão humana' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('integrity failed');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('keeps missing data as null without defaulting to normality', async () => {
    setCompany(130, 'bombeiros');
    render(<BombeirosCheckinPage />);
    fireEvent.click(screen.getByLabelText('Confirmar ciência e confidencialidade'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para revisão humana' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String((mutateMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).toMatchObject({
      sleep_hours_24h: null, kss_reported: null,
      pvt_60s_completed: null, self_declared_unfit: null,
    });
  });
});
