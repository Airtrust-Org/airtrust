import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceReportBuilder } from '../TrainingComplianceReportBuilder';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));
vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { nome: 'Admin', role: 'admin' },
    empresas: [{ id: 1, nome: 'Costa do Sol' }],
    empresaAtualId: 1,
  }),
}));
vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({ isAdmin: true }),
}));
vi.mock('sonner', () => ({ toast: toastMock }));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

const catalogs = {
  setores: [
    { id: 1, nome: 'Operações' },
    { id: 2, nome: 'Manutenção' },
  ],
  funcoes: [
    { id: 10, nome: 'Piloto' },
    { id: 20, nome: 'Mecânico' },
  ],
  funcionarios: [
    { id: 100, nome: 'Ana Piloto', matricula: '00100', setor_id: 1, funcao_id: 10 },
    { id: 200, nome: 'Beto Mecânico', matricula: '00200', setor_id: 2, funcao_id: 20 },
  ],
  setor_funcoes: [
    { setor_id: 1, funcao_id: 10 },
    { setor_id: 2, funcao_id: 20 },
  ],
};

const row = {
  funcionario_id: 100,
  funcionario_nome: 'Ana Piloto',
  matricula: '00100',
  setor_id: 1,
  setor_nome: 'Operações',
  funcao_id: 10,
  funcao_nome: 'Piloto',
  qualificacao_tipo_id: 300,
  qualificacao_tipo_nome: 'CRM',
  qualificacao_tipo_codigo: 'CRM',
  status_compliance: 'VENCIDO',
  data_validade: '2026-09-20',
  dias_para_vencer: -11,
  ultima_data: '2025-09-20',
  critico_operacional: true,
  referencia_normativa: 'PTO',
  curso_ead_titulo: null,
  tem_email: true,
  tem_whatsapp: true,
  avisos_enviados: 0,
  ultimo_aviso_em: null,
  ultimo_canal: null,
  ultimo_status_envio: null,
};

const automation = {
  enabled: false,
  frequency: 'WEEKLY',
  weekday: 1,
  day_of_month: 1,
  time: '08:00',
  timezone: 'America/Sao_Paulo',
  sector_ids: [] as number[],
  statuses: ['VENCIDO', 'NAO_REALIZADO', 'VENCENDO', 'EM_ANDAMENTO'],
  critical_only: false,
  due_within_days: null,
};

function renderBuilder() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TrainingComplianceReportBuilder
        catalogs={catalogs}
        trainingTypes={[
          { id: 300, nome: 'CRM', codigo: 'CRM' },
          { id: 400, nome: 'AVSEC', codigo: 'AVSEC' },
        ]}
        initialSectorId={null}
        initialFunctionId={null}
      />
    </QueryClientProvider>,
  );
}

describe('TrainingComplianceReportBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.includes('/relatorios/automacao') && options?.method === 'PUT') {
        const payload = JSON.parse(String(options.body));
        return ok(payload);
      }
      if (url.includes('/relatorios/automacao')) return ok(automation);
      if (url.includes('/relatorios/enviar-gestores')) {
        return ok({ setores: 2, setores_enviados: 2, destinatarios: 2 });
      }
      if (url.includes('/pendencias')) return ok([row]);
      throw new Error(`unexpected ${url}`);
    });
  });

  it('combina filtros, envia setores selecionados e permite ativar a programação', async () => {
    renderBuilder();

    await screen.findByText('Gerador de relatórios');
    await screen.findByText('Modo automático');
    expect(screen.getByText(/Selecione ao menos um setor para habilitar/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Função'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Funcionário'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Treinamento'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Completo' }));

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        expect.stringContaining('funcionario_id=100'),
      ),
    );
    expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('qualificacao_tipo_id=300'),
    );
    expect(fetchWithAuthMock).toHaveBeenCalledWith(expect.stringContaining('CONFORME'));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar ao gestor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText('Manutenção'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Enviar \(2\)/ }));

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/relatorios/enviar-gestores',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining('2 gestor'));

    fireEvent.click(screen.getByLabelText('Operações'));
    const toggle = screen.getByRole('button', { pressed: false });
    fireEvent.click(toggle);

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/relatorios/automacao',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });
});
