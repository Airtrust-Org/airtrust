import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceReportBuilder } from '../TrainingComplianceReportBuilder';

const { fetchWithAuthMock, fetchHistoryMock, exportHistoryPdfMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  fetchHistoryMock: vi.fn(),
  exportHistoryPdfMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));
vi.mock('@/react-app/pages/relatorios/qualificationHistoryReport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/react-app/pages/relatorios/qualificationHistoryReport')>()),
  fetchQualificationHistoryForType: (...args: unknown[]) => fetchHistoryMock(...args),
  exportQualificationHistoryPdf: (...args: unknown[]) => exportHistoryPdfMock(...args),
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

  it('exporta histórico de qualificações renovadas mesmo quando o filtro de Compliance é independente', async () => {
    const historical = [
      { id: 1, status: 'RENOVADA', qualificacao_id: 300 },
      { id: 2, status: 'VENCIDA', qualificacao_id: 300 },
    ];
    fetchHistoryMock.mockResolvedValue(historical);
    exportHistoryPdfMock.mockResolvedValue(undefined);
    renderBuilder();

    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Treinamento'), { target: { value: '300' } });
    await waitFor(() => expect(screen.getByText('Histórico cadastrado — CRM')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Registros no histórico')).toBeInTheDocument());
    expect(screen.getByText('Renovados')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: '.text-2xl' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Gerar PDF do histórico (2 registros)' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Gerar PDF do histórico (2 registros)' }));

    await waitFor(() => expect(fetchHistoryMock).toHaveBeenCalledWith(expect.objectContaining({
      setorIds: [1],
      statuses: expect.arrayContaining(['RENOVADA', 'VALIDA', 'VENCIDA']),
    }), expect.objectContaining({ id: 300, codigo: 'CRM' })));
    expect(exportHistoryPdfMock).toHaveBeenCalledWith(historical, expect.objectContaining({
      filterLabels: expect.arrayContaining(['Qualificação: CRM']),
    }));
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining('2 registro'));
  });

  it('gera o PDF completo dos 44 CMAs mesmo quando não existem requisitos obrigatórios', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.includes('/relatorios/automacao')) return ok(automation);
      if (url.includes('/pendencias')) return ok([]);
      throw new Error(`unexpected ${url}`);
    });
    const history = Array.from({ length: 44 }, (_, index) => ({
      id: index + 1,
      funcionario_id: index % 23 + 1,
      funcionario_nome: `Tripulante ${index % 23 + 1}`,
      funcionario_setor: 'Operações',
      qualificacao_id: 300,
      qualificacao_codigo: 'CRM',
      status: index < 21 ? 'RENOVADA' : index < 43 ? 'VALIDA' : 'VENCIDA',
      data_conclusao: '2025-03-01',
      data_vencimento: '2026-03-01',
    }));
    fetchHistoryMock.mockResolvedValue(history);
    exportHistoryPdfMock.mockResolvedValue(undefined);
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Treinamento'), { target: { value: '300' } });
    const pdf = await screen.findByRole('button', { name: 'Gerar PDF do histórico (44 registros)' });
    await waitFor(() => expect(pdf).toBeEnabled());
    expect(screen.getByText('Registros no histórico')).toBeInTheDocument();
    expect(screen.getByText('Renovados')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'PDF de requisitos obrigatórios' })).not.toBeInTheDocument();

    fireEvent.click(pdf);
    await waitFor(() => expect(exportHistoryPdfMock).toHaveBeenCalledWith(
      history,
      expect.objectContaining({ filterLabels: expect.arrayContaining(['Qualificação: CRM']) }),
    ));
    expect(toastMock.success).toHaveBeenCalledWith('PDF de histórico gerado com 44 registro(s).');
    expect(toastMock.warning).not.toHaveBeenCalled();
  });

  it('explica quando a qualificação existe mas o cadastro não está no setor filtrado', async () => {
    fetchHistoryMock.mockImplementation(async (filters: { setorIds?: number[] }) => (
      filters.setorIds?.length ? [] : [
        {
          id: 901,
          funcionario_id: 45,
          funcionario_nome: 'Carlos Piloto',
          funcionario_setor: 'Operações',
          status: 'RENOVADA',
          qualificacao_id: 300,
          data_conclusao: '2025-02-01',
        },
      ]
    ));
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Treinamento'), { target: { value: '300' } });
    await screen.findByRole('button', { name: 'Ver em todos os setores' });
    expect(screen.queryByText('Carlos Piloto')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver em todos os setores' }));
    await screen.findByText('Carlos Piloto');
    expect(within(screen.getByRole('table')).getByText('Operações')).toBeInTheDocument();
  });

  it('não apresenta erro de leitura do histórico como ausência de certificados na exportação', async () => {
    fetchHistoryMock.mockRejectedValue(new Error('HISTORICO_SEM_PERMISSAO'));
    renderBuilder();
    fireEvent.change(screen.getByLabelText('Treinamento'), { target: { value: '300' } });
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Gerar PDF do histórico (0 registros)' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('HISTORICO_SEM_PERMISSAO');
    expect(toastMock.warning).not.toHaveBeenCalledWith(
      expect.stringContaining('Nenhum registro cadastrado'),
    );
    expect(exportHistoryPdfMock).not.toHaveBeenCalled();
  });

  it('não produz PDF de Compliance vazio quando não existem requisitos obrigatórios', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string) => {
      if (url.includes('/relatorios/automacao')) return ok(automation);
      if (url.includes('/pendencias')) return ok([]);
      throw new Error(`unexpected ${url}`);
    });
    renderBuilder();
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith(
      expect.stringContaining('/pendencias'),
    ));
    expect(screen.getByRole('button', { name: 'Gerar PDF de requisitos' })).toBeDisabled();
    expect(exportHistoryPdfMock).not.toHaveBeenCalled();
    expect(toastMock.warning).not.toHaveBeenCalled();
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
