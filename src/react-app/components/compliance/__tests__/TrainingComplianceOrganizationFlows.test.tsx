import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { TrainingComplianceOrganizationEditor } from '../TrainingComplianceOrganizationEditor';
import { TrainingEnrollmentReconciliation } from '../TrainingEnrollmentReconciliation';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/react-app/config/api', () => ({
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));
vi.mock('@/react-app/utils/toast', () => ({ showToast: toastMock }));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

function renderWithClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

const matrixRows = [
  {
    qualificacao_tipo_id: 100,
    qualificacao_tipo_codigo: 'CRM',
    qualificacao_tipo_nome: 'CRM Periódico',
    efetiva: { id: 901, escopo: 'EMPRESA', obrigatoriedade: 'OBRIGATORIA' },
    direta: null,
    impacto: {
      pessoas: 12,
      atingidas_neste_nivel: 10,
      override_mais_especifico: 2,
      com_requisito: 8,
      sem_requisito: 4,
      conformes: 5,
      vencendo: 1,
      vencidos: 1,
      nunca_realizados: 2,
      em_andamento: 0,
      matriculados: 9,
      sem_matricula: 3,
    },
  },
  {
    qualificacao_tipo_id: 200,
    qualificacao_tipo_codigo: null,
    qualificacao_tipo_nome: 'PBN',
    efetiva: null,
    direta: { id: 902, escopo: 'SETOR', obrigatoriedade: 'RECOMENDADA' },
    impacto: {
      pessoas: 12,
      atingidas_neste_nivel: 12,
      override_mais_especifico: 0,
      com_requisito: 0,
      sem_requisito: 12,
      conformes: 0,
      vencendo: 0,
      vencidos: 0,
      nunca_realizados: 0,
      em_andamento: 0,
      matriculados: 2,
      sem_matricula: 10,
    },
  },
];

describe('Training Compliance organization flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters roles by sector and creates, updates and removes organization rules', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalogos')) {
        return ok({
          setores: [{ id: 1, nome: 'Operações' }],
          funcoes: [
            { id: 10, nome: 'Coordenador de Voo' },
            { id: 11, nome: 'Mecânico' },
          ],
          setor_funcoes: [{ setor_id: 1, funcao_id: 10 }],
        });
      }
      if (url.includes('/matriz-organizacao')) return ok(matrixRows);
      if (url.includes('/regras')) return ok({ id: 999, method: init?.method });
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<TrainingComplianceOrganizationEditor />);
    expect(screen.getByText(/Selecione um setor para ver/)).toBeInTheDocument();

    await screen.findByRole('option', { name: 'Operações' });
    const sectorSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
    fireEvent.change(sectorSelect, { target: { value: '1' } });
    await waitFor(() => expect(sectorSelect.value).toBe('1'));
    await screen.findByText('CRM Periódico');
    expect(screen.getByRole('option', { name: 'Coordenador de Voo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Mecânico' })).not.toBeInTheDocument();
    expect(screen.getByText(/2 preservada\(s\)/)).toBeInTheDocument();
    expect(screen.getByText('Sem regra')).toBeInTheDocument();

    const crmRow = screen.getByText('CRM Periódico').closest('tr')!;
    fireEvent.change(within(crmRow).getByRole('combobox'), { target: { value: 'OBRIGATORIA' } });
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const pbnRow = screen.getByText('PBN').closest('tr')!;
    fireEvent.change(within(pbnRow).getByRole('combobox'), { target: { value: 'OBRIGATORIA' } });
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras/902',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );

    fireEvent.change(within(pbnRow).getByRole('combobox'), { target: { value: 'HERDAR' } });
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras/902',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Cargo / função'), { target: { value: '10' } });
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        expect.stringContaining('setor_id=1&funcao_id=10'),
      ),
    );
    expect(toastMock.success).toHaveBeenCalledWith('Matriz atualizada.');
  });
});

const reconciliationData = {
  resumo: {
    matriculas_ativas: 10,
    matriculas_alinhadas: 6,
    requisitos_sem_matricula: 2,
    gaps_matricula_acionaveis: 1,
    matriculados_sem_requisito: 1,
    nao_aplica_matriculados: 1,
    cursos_sem_modelo: 1,
    matriculas_avulsas_reconciliadas: 1,
  },
  gaps_matricula: [
    {
      qualificacao_tipo_id: 100,
      qualificacao_tipo_nome: 'CRM Periódico',
      qualificacao_tipo_codigo: 'CRM',
      pessoas: 2,
      vencendo: 0,
      vencidos: 1,
      nunca_realizados: 1,
      funcionarios: [
        { id: 1, nome: 'Pessoa A', status_compliance: 'VENCIDO' },
        { id: 2, nome: 'Pessoa B', status_compliance: 'NAO_REALIZADO' },
      ],
      cursos_ead: [{ id: 77, titulo: 'CRM EAD' }],
    },
  ],
  matriculas_revisao: [
    {
      matricula_id: 501,
      funcionario_id: 1,
      funcionario_nome: 'Pessoa A',
      setor_id: 3,
      setor_nome: 'Operações',
      funcao_id: 9,
      funcao_nome: 'Coordenador de Voo',
      curso_titulo: 'CRM EAD',
      qualificacao_tipo_id: 100,
      qualificacao_tipo_nome: 'CRM Periódico',
      matricula_status: 'ATIVA',
      situacao: 'MATRICULADO_SEM_REQUISITO',
      regra_efetiva: { id: 601, escopo: 'SETOR_FUNCAO', obrigatoriedade: 'RECOMENDADA' },
    },
    {
      matricula_id: 502,
      funcionario_id: 2,
      funcionario_nome: 'Pessoa B',
      setor_id: null,
      setor_nome: null,
      funcao_id: null,
      funcao_nome: null,
      curso_titulo: 'Curso avulso',
      qualificacao_tipo_id: null,
      qualificacao_tipo_nome: null,
      matricula_status: 'ATIVA',
      situacao: 'CURSO_SEM_MODELO',
      regra_efetiva: null,
    },
    {
      matricula_id: 503,
      funcionario_id: 3,
      funcionario_nome: 'Pessoa C',
      setor_id: 3,
      setor_nome: 'Operações',
      funcao_id: 9,
      funcao_nome: 'Coordenador de Voo',
      curso_titulo: 'PBN EAD',
      qualificacao_tipo_id: 200,
      qualificacao_tipo_nome: 'PBN',
      matricula_status: 'ATIVA',
      situacao: 'MATRICULA_AVULSA_RECONCILIADA',
      regra_efetiva: null,
    },
  ],
};

describe('Training enrollment reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enrolls missing people and applies explicit reconciliation decisions', async () => {
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes('/reconciliacao') && (!init?.method || init.method === 'GET')) {
        return ok(reconciliationData);
      }
      if (url === '/api/lms/matriculas/lote') return ok({ criadas: 2, ignoradas: 0, erros: 0 });
      if (url.includes('/reconciliacao/') && url.endsWith('/decisao')) return ok({ id: 1 });
      if (url.includes('/regras')) return ok({ id: 700 });
      throw new Error(`unexpected url ${url}`);
    });

    renderWithClient(<TrainingEnrollmentReconciliation setorId={3} funcaoId={9} />);
    await screen.findAllByText('CRM EAD');
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/1 matrícula\(s\) usam curso sem modelo/)).toBeInTheDocument();
    expect(screen.getByText('Sem setor')).toBeInTheDocument();
    expect(screen.getByText(/Sem modelo/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Matricular gaps agora/ }));
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/lms/matriculas/lote',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const rowA = screen.getByText('Pessoa A').closest('tr')!;
    fireEvent.change(within(rowA).getByRole('combobox'), {
      target: { value: 'VINCULAR_SETOR_FUNCAO' },
    });
    fireEvent.click(within(rowA).getByRole('button', { name: /Aplicar/ }));
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras/601',
        expect.objectContaining({ method: 'PUT' }),
      ),
    );

    const rowB = screen.getByText('Pessoa B').closest('tr')!;
    fireEvent.change(within(rowB).getByRole('combobox'), { target: { value: 'MANTER_AVULSA' } });
    fireEvent.click(within(rowB).getByRole('button', { name: /Aplicar/ }));
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/reconciliacao/502/decisao',
        expect.objectContaining({ method: 'POST' }),
      ),
    );

    const rowC = screen.getByText('Pessoa C').closest('tr')!;
    fireEvent.change(within(rowC).getByRole('combobox'), { target: { value: 'REABRIR' } });
    fireEvent.click(within(rowC).getByRole('button', { name: /Aplicar/ }));
    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/reconciliacao/503/decisao',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );

    expect(toastMock.success).toHaveBeenCalled();
  });
});
