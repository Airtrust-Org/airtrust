import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { TrainingComplianceBulkNoticeComposer } from '../TrainingComplianceBulkNoticeComposer';

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

const catalogs = {
  setores: [
    { id: 1, nome: 'Operações' },
    { id: 2, nome: 'Manutenção' },
  ],
  funcoes: [
    { id: 10, nome: 'Comandante' },
    { id: 20, nome: 'Mecânico' },
  ],
  funcionarios: [
    { id: 100, nome: 'Ana Piloto' },
    { id: 200, nome: 'Bruno Mecânico' },
  ],
  setor_funcoes: [
    { setor_id: 1, funcao_id: 10 },
    { setor_id: 2, funcao_id: 20 },
  ],
};

const trainingTypes = [
  { id: 1000, nome: 'CRM', codigo: 'CRM' },
  { id: 2000, nome: 'AVSEC', codigo: 'AVSEC' },
];

const rows = {
  training: [
    {
      funcionario_id: 100,
      funcionario_nome: 'Ana Piloto',
      qualificacao_tipo_id: 1000,
      qualificacao_tipo_nome: 'CRM',
      status_compliance: 'NAO_REALIZADO',
      tem_email: true,
      tem_whatsapp: true,
    },
    {
      funcionario_id: 101,
      funcionario_nome: 'Carlos Piloto',
      qualificacao_tipo_id: 1000,
      qualificacao_tipo_nome: 'CRM',
      status_compliance: 'VENCENDO',
      tem_email: true,
      tem_whatsapp: true,
    },
  ],
  person: [
    {
      funcionario_id: 100,
      funcionario_nome: 'Ana Piloto',
      qualificacao_tipo_id: 1000,
      qualificacao_tipo_nome: 'CRM',
      status_compliance: 'NAO_REALIZADO',
      tem_email: true,
      tem_whatsapp: true,
    },
    {
      funcionario_id: 100,
      funcionario_nome: 'Ana Piloto',
      qualificacao_tipo_id: 2000,
      qualificacao_tipo_nome: 'AVSEC',
      status_compliance: 'VENCIDO',
      tem_email: true,
      tem_whatsapp: true,
    },
  ],
  role: [
    {
      funcionario_id: 200,
      funcionario_nome: 'Bruno Mecânico',
      qualificacao_tipo_id: 2000,
      qualificacao_tipo_nome: 'AVSEC',
      status_compliance: 'VENCIDO',
      tem_email: true,
      tem_whatsapp: false,
    },
  ],
  sector: [
    {
      funcionario_id: 200,
      funcionario_nome: 'Bruno Mecânico',
      qualificacao_tipo_id: 2000,
      qualificacao_tipo_nome: 'AVSEC',
      status_compliance: 'VENCIDO',
      tem_email: true,
      tem_whatsapp: false,
    },
    {
      funcionario_id: 201,
      funcionario_nome: 'Daniel Mecânico',
      qualificacao_tipo_id: 1000,
      qualificacao_tipo_nome: 'CRM',
      status_compliance: 'VENCENDO',
      tem_email: false,
      tem_whatsapp: true,
    },
  ],
};

describe('TrainingComplianceBulkNoticeComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('combines training, person, role and sector selections and removes overlapping targets', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/compliance-treinamentos/pendencias?')) {
        const parsed = new URL(url, 'https://airtrust.local');
        if (parsed.searchParams.get('qualificacao_tipo_id') === '1000') return ok(rows.training);
        if (parsed.searchParams.get('funcionario_id') === '100') return ok(rows.person);
        if (parsed.searchParams.get('funcao_id') === '20') return ok(rows.role);
        if (parsed.searchParams.get('setor_id') === '2') return ok(rows.sector);
        return ok([]);
      }
      if (url === '/api/compliance-treinamentos/avisos/enviar' && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body)) as { targets: unknown[] };
        return ok({
          selecionados: payload.targets.length,
          email_sucesso: 4,
          whatsapp_sucesso: 4,
          email_falha: 0,
          whatsapp_falha: 0,
          sem_email: 1,
          sem_whatsapp: 1,
        });
      }
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(
      <TrainingComplianceBulkNoticeComposer
        catalogs={catalogs}
        trainingTypes={trainingTypes}
        currentFilter={{ setorId: null, funcaoId: null, search: '' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Envio múltiplo' }));

    const kind = screen.getByLabelText('Tipo de seleção do envio múltiplo');
    const item = screen.getByLabelText('Item do envio múltiplo');

    fireEvent.change(kind, { target: { value: 'TRAINING' } });
    fireEvent.change(item, { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    fireEvent.change(kind, { target: { value: 'PERSON' } });
    fireEvent.change(screen.getByLabelText('Item do envio múltiplo'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    fireEvent.change(kind, { target: { value: 'ROLE' } });
    fireEvent.change(screen.getByLabelText('Item do envio múltiplo'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    fireEvent.change(kind, { target: { value: 'SECTOR' } });
    fireEvent.change(screen.getByLabelText('Item do envio múltiplo'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await screen.findByRole('button', { name: 'Enviar 5 alerta(s)' });
    expect(screen.getByText(/5 alerta\(s\) únicos/)).toBeInTheDocument();
    expect(screen.getByText(/Sobreposições entre curso/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar 5 alerta(s)' }));

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
    const body = JSON.parse(String((sendCall?.[1] as RequestInit).body));
    expect(body.targets).toEqual([
      { funcionario_id: 100, qualificacao_tipo_id: 1000 },
      { funcionario_id: 101, qualificacao_tipo_id: 1000 },
      { funcionario_id: 100, qualificacao_tipo_id: 2000 },
      { funcionario_id: 200, qualificacao_tipo_id: 2000 },
      { funcionario_id: 201, qualificacao_tipo_id: 1000 },
    ]);
    expect(body.canais).toEqual({ email: true, whatsapp: true });
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
  });

  it('supports a specific sector plus role group and preserves both filters in the preview query', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/compliance-treinamentos/pendencias?')) return ok(rows.role);
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(
      <TrainingComplianceBulkNoticeComposer catalogs={catalogs} trainingTypes={trainingTypes} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Envio múltiplo' }));
    fireEvent.change(screen.getByLabelText('Tipo de seleção do envio múltiplo'), {
      target: { value: 'SECTOR_ROLE' },
    });
    fireEvent.change(screen.getByLabelText('Setor do envio múltiplo'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Cargo do envio múltiplo'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await screen.findByRole('button', { name: 'Enviar 1 alerta(s)' });
    const pendingCall = fetchWithAuthMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/compliance-treinamentos/pendencias?'),
    );
    const parsed = new URL(String(pendingCall?.[0]), 'https://airtrust.local');
    expect(parsed.searchParams.get('setor_id')).toBe('2');
    expect(parsed.searchParams.get('funcao_id')).toBe('20');
  });
});
