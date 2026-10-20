import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BombeirosCaseManagementPage from '../BombeirosCaseManagementPage';

const useAuthMock = vi.fn();
const useApiMock = vi.fn();
const mutateMock = vi.fn();
const refetchMock = vi.fn();

vi.mock('@/react-app/hooks/useAuth', () => ({ useAuth: () => useAuthMock() }));
vi.mock('@/react-app/hooks/useApi', () => ({
  useApi: (...args: unknown[]) => useApiMock(...args),
  useApiMutation: () => ({ mutate: mutateMock, loading: false, error: null }),
}));
vi.mock('@/react-app/components/AppLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
function setupTenant(id: number, code: string) {
  useAuthMock.mockReturnValue({
    empresas: [{ id, codigo: code }], empresaAtualId: id,
  });
}
function caseEnvelope(state: string) {
  return { success: true, data: {
    case_id: 'BOA-QA-ALERT-1', state,
    created_at: '2026-10-20', closed_at: null,
    treatment_recorded: state !== 'ABERTO',
  }, meta: { tenant_id: 130 } };
}
describe('BOA mitigation and efficacy manager portal', () => {
  beforeEach(() => {
    useAuthMock.mockReset(); useApiMock.mockReset(); mutateMock.mockReset(); refetchMock.mockReset();
    mutateMock.mockResolvedValue({ success: true, status: 'EM_TRATAMENTO' });
    useApiMock.mockReturnValue({
      data: caseEnvelope('ABERTO'), loading: false, error: null, refetch: refetchMock,
    });
  });

  it('never renders a BOA case workflow in empresa 6', () => {
    setupTenant(6, 'costadosol');
    render(<BombeirosCaseManagementPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('exclusiva da empresa Bombeiros');
    expect(screen.queryByRole('textbox', { name: 'Identificador da ocorrência BOA' })).not.toBeInTheDocument();
    expect(useApiMock.mock.calls[0][1]).toMatchObject({ enabled: false });
  });

  it('records owner, deadline, action and reason only on the isolated BOA endpoint', async () => {
    setupTenant(130, 'bombeiros');
    render(<BombeirosCaseManagementPage />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Identificador da ocorrência BOA' }), {
      target: { value: 'BOA-QA-ALERT-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    expect(screen.getByText(/ABERTO/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Responsável pela mitigação' }), {
      target: { value: 'Coordenador BOA' },
    });
    fireEvent.change(screen.getByLabelText('Prazo da mitigação'), {
      target: { value: '2026-10-30' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Medida de mitigação' }), {
      target: { value: 'Reorganizar equipe e revisar repouso de missão crítica.' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Justificativa da mitigação' }), {
      target: { value: 'Acionamento noturno exige revisão humana do registro.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar tratamento' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledOnce());
    const [url, init] = mutateMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/bombeiros/frms/casos/BOA-QA-ALERT-1/tratamento');
    expect(JSON.parse(String(init.body))).toMatchObject({
      responsavel: 'Coordenador BOA', prazo: '2026-10-30',
    });
    expect(String(init.body)).not.toContain('empresa_id');
    expect(refetchMock).toHaveBeenCalled();
  });

  it('requires the efficacy field before sending case-closure request', async () => {
    setupTenant(130, 'bombeiros');
    useApiMock.mockReturnValue({
      data: caseEnvelope('EM_TRATAMENTO'),
      loading: false, error: null, refetch: refetchMock,
    });
    render(<BombeirosCaseManagementPage />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Identificador da ocorrência BOA' }), {
      target: { value: 'BOA-QA-ALERT-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Verificação documentada de eficácia' }), {
      target: { value: 'Repouso e escala verificados e documentados após medida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar com eficácia documentada' }));
    await waitFor(() => expect(mutateMock).toHaveBeenCalledOnce());
    const [url, init] = mutateMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/bombeiros/frms/casos/BOA-QA-ALERT-1/resolver');
    expect(JSON.parse(String(init.body))).toMatchObject({
      avaliacao_eficacia: 'Repouso e escala verificados e documentados após medida.',
    });
  });
});
