import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { TrainingComplianceNoticeAction } from '../TrainingComplianceNoticeAction';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('@/react-app/utils/toast', () => ({
  showToast: toastMock,
}));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const pendingRows = [
  {
    funcionario_id: 10,
    funcionario_nome: 'Pessoa A',
    qualificacao_tipo_id: 100,
    qualificacao_tipo_nome: 'CRM',
    status_compliance: 'NAO_REALIZADO',
    tem_email: true,
    tem_whatsapp: true,
  },
  {
    funcionario_id: 10,
    funcionario_nome: 'Pessoa A',
    qualificacao_tipo_id: 200,
    qualificacao_tipo_nome: 'AVSEC',
    status_compliance: 'VENCENDO',
    tem_email: true,
    tem_whatsapp: false,
  },
  {
    funcionario_id: 20,
    funcionario_nome: 'Pessoa B',
    qualificacao_tipo_id: 300,
    qualificacao_tipo_nome: 'NR-6',
    status_compliance: 'VENCIDO',
    tem_email: false,
    tem_whatsapp: true,
  },
];

describe('TrainingComplianceNoticeAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads the scoped pending items and sends only the selected alert types', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/compliance-treinamentos/pendencias?')) return ok(pendingRows);
      if (url === '/api/compliance-treinamentos/avisos/enviar' && init?.method === 'POST') {
        return ok({
          selecionados: 2,
          email_sucesso: 1,
          whatsapp_sucesso: 2,
          email_falha: 0,
          whatsapp_falha: 0,
          sem_email: 1,
          sem_whatsapp: 0,
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(
      <TrainingComplianceNoticeAction
        scopeLabel="setor Operações"
        pendingCount={3}
        setorId={7}
        funcaoId={9}
        search="Pessoa"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Alertas' }));

    await screen.findByText('Matrícula / não realizado');
    const pendingCall = fetchWithAuthMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/compliance-treinamentos/pendencias?'),
    );
    const pendingUrl = new URL(String(pendingCall?.[0]), 'https://airtrust.local');
    expect(pendingUrl.searchParams.get('setor_id')).toBe('7');
    expect(pendingUrl.searchParams.get('funcao_id')).toBe('9');
    expect(pendingUrl.searchParams.get('q')).toBe('Pessoa');
    expect(pendingUrl.searchParams.get('status')).toBe('NAO_REALIZADO,VENCENDO,VENCIDO');

    const vencendoLabel = screen.getByText('Vencendo').closest('label');
    expect(vencendoLabel).not.toBeNull();
    fireEvent.click(within(vencendoLabel!).getByRole('checkbox'));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar 2 alerta(s)' }));

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/avisos/enviar',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const sendCall = fetchWithAuthMock.mock.calls.find(
      ([url, init]) =>
        url === '/api/compliance-treinamentos/avisos/enviar' &&
        (init as RequestInit | undefined)?.method === 'POST',
    );
    expect(JSON.parse(String((sendCall?.[1] as RequestInit)?.body))).toEqual({
      targets: [
        { funcionario_id: 10, qualificacao_tipo_id: 100 },
        { funcionario_id: 20, qualificacao_tipo_id: 300 },
      ],
      canais: { email: true, whatsapp: true },
    });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it('splits large scoped sends into batches accepted by the API', async () => {
    const manyRows = Array.from({ length: 201 }, (_, index) => ({
      funcionario_id: index + 1,
      funcionario_nome: `Pessoa ${index + 1}`,
      qualificacao_tipo_id: 900,
      qualificacao_tipo_nome: 'Integração Corporativa',
      status_compliance: 'NAO_REALIZADO',
      tem_email: true,
      tem_whatsapp: true,
    }));

    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/compliance-treinamentos/pendencias?')) return ok(manyRows);
      if (url === '/api/compliance-treinamentos/avisos/enviar' && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { targets: unknown[] };
        return ok({
          selecionados: payload.targets.length,
          email_sucesso: payload.targets.length,
          whatsapp_sucesso: payload.targets.length,
          email_falha: 0,
          whatsapp_falha: 0,
          sem_email: 0,
          sem_whatsapp: 0,
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(
      <TrainingComplianceNoticeAction
        scopeLabel="Integração Corporativa"
        pendingCount={201}
        qualificacaoTipoId={900}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Alertas' }));
    await screen.findByRole('button', { name: 'Enviar 201 alerta(s)' });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar 201 alerta(s)' }));

    await waitFor(() => {
      const sendCalls = fetchWithAuthMock.mock.calls.filter(
        ([url, init]) =>
          url === '/api/compliance-treinamentos/avisos/enviar' &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(sendCalls).toHaveLength(2);
      expect(JSON.parse(String((sendCalls[0][1] as RequestInit).body)).targets).toHaveLength(200);
      expect(JSON.parse(String((sendCalls[1][1] as RequestInit).body)).targets).toHaveLength(1);
    });
  });
});
