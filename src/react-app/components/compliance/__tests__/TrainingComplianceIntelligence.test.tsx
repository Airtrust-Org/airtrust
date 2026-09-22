import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { TrainingComplianceIntelligence } from '../TrainingComplianceIntelligence';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args) }));
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { nome: 'Admin', role: 'admin' },
    empresas: [{ id: 1, nome: 'Costa do Sol' }],
    empresaAtualId: 1,
  }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const pending = {
  funcionario_id: 10,
  funcionario_nome: 'Pessoa Pendente',
  matricula: '0010',
  setor_id: 1,
  setor_nome: 'Operações',
  funcao_id: 2,
  funcao_nome: 'Piloto',
  qualificacao_tipo_id: 100,
  qualificacao_tipo_nome: 'CRM',
  qualificacao_tipo_codigo: 'CRM',
  status_compliance: 'NAO_REALIZADO',
  data_validade: null,
  dias_para_vencer: null,
  ultima_data: null,
  critico_operacional: true,
  referencia_normativa: 'PTO',
  curso_ead_titulo: 'CRM EAD',
  tem_email: true,
  tem_whatsapp: true,
  avisos_enviados: 2,
  ultimo_aviso_em: '2026-09-20T10:00:00Z',
  ultimo_canal: 'EMAIL_COMPLIANCE',
  ultimo_status_envio: 'enviada',
};

const props = {
  setorId: 1,
  funcaoId: null,
  catalogs: {
    setores: [{ id: 1, nome: 'Operações' }],
    funcoes: [{ id: 2, nome: 'Piloto' }],
    setor_funcoes: [{ setor_id: 1, funcao_id: 2 }],
  },
  summary: {
    pessoas: 20,
    requisitos_obrigatorios: 40,
    conformes: 32,
    vencendo: 2,
    vencidos: 3,
    nao_realizados: 3,
    em_andamento: 0,
    compliance_pct: 80,
  },
};

describe('TrainingComplianceIntelligence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows actionable never-done pending items and previews resend channels', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.includes('/pendencias')) return ok([pending]);
      if (url.includes('/avisos/preview')) return ok({ selecionados: 1, com_email: 1, sem_email: 0, com_whatsapp: 1, sem_whatsapp: 0, vencidos: 0, nunca_realizados: 1 });
      throw new Error(`unexpected ${url}`);
    });

    renderWithClient(<TrainingComplianceIntelligence mode="pendencias" {...props} />);
    await screen.findByText('Pessoa Pendente');
    expect(screen.getAllByText('Nunca realizou').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('2 aviso(s)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reenviar aviso' }));
    await screen.findByText('Enviar cobrança de treinamento');
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith('/api/compliance-treinamentos/avisos/preview', expect.anything()));
    expect(screen.getByText('WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('E-mail')).toBeInTheDocument();
  });

  it('shows deterministic report trend and recurrent pending items', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.includes('/pendencias')) return ok([pending]);
      if (url.includes('/tendencias')) return ok([
        { snapshot_date: '2026-09-20', setor_id: 1, funcao_id: 0, pessoas: 20, pessoas_com_pendencia: 5, requisitos_obrigatorios: 40, conformes: 30, vencendo: 2, vencidos: 4, nao_realizados: 4, em_andamento: 0, compliance_pct: 75 },
        { snapshot_date: '2026-09-21', setor_id: 1, funcao_id: 0, pessoas: 20, pessoas_com_pendencia: 4, requisitos_obrigatorios: 40, conformes: 32, vencendo: 2, vencidos: 3, nao_realizados: 3, em_andamento: 0, compliance_pct: 80 },
      ]);
      throw new Error(`unexpected ${url}`);
    });

    renderWithClient(<TrainingComplianceIntelligence mode="relatorios" {...props} />);
    await screen.findByText('Evolução do compliance — 90 dias');
    expect((await screen.findAllByText('Pessoa Pendente')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Atual: 80% · \+5 p\.p\./)).toBeInTheDocument();
    expect(screen.getByText('Pendências recorrentes')).toBeInTheDocument();
    expect(screen.getByText(/O setor Operações possui 1 colaborador/)).toBeInTheDocument();
  });
});
