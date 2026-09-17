import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceOrganizationEditor } from '../TrainingComplianceOrganizationEditor';

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

function renderEditor() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TrainingComplianceOrganizationEditor />
    </QueryClientProvider>,
  );
}

const row = {
  qualificacao_tipo_id: 300,
  qualificacao_tipo_codigo: 'AW139-REC',
  qualificacao_tipo_nome: 'AW139 Recorrente',
  efetiva: null,
  direta: null,
  impacto: {
    pessoas: 4,
    atingidas_neste_nivel: 4,
    override_mais_especifico: 0,
    com_requisito: 0,
    sem_requisito: 4,
    conformes: 0,
    vencendo: 0,
    vencidos: 0,
    nunca_realizados: 0,
    em_andamento: 0,
    matriculados: 0,
    sem_matricula: 4,
  },
};

describe('Training Compliance aircraft filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/catalogos')) {
        return ok({
          setores: [
            { id: 1, codigo: 'TRIP', nome: 'Tripulação' },
            { id: 2, codigo: 'ADM', nome: 'Administrativo' },
          ],
          funcoes: [{ id: 10, nome: 'Piloto' }],
          setor_funcoes: [{ setor_id: 1, funcao_id: 10 }],
          aeronaves_modelos: [
            { modelo: 'AW139', aeronaves: 3 },
            { modelo: 'SK76', aeronaves: 2 },
          ],
        });
      }
      if (url.includes('/matriz-organizacao')) return ok([row]);
      if (url === '/api/compliance-treinamentos/regras' && init?.method === 'POST') {
        return ok({ id: 999 });
      }
      throw new Error(`unexpected url ${url}`);
    });
  });

  it('loads AW139 and SK76 for Tripulação and scopes the matrix request by aircraft', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Tripulação' });
    expect(screen.queryByLabelText('Modelo de aeronave')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    await screen.findByText('AW139 Recorrente');

    expect(screen.getByRole('option', { name: 'AW139' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'SK76' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Cargo / função'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Modelo de aeronave'), {
      target: { value: 'AW139' },
    });

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        expect.stringContaining('setor_id=1&funcao_id=10&aeronave_modelo=AW139'),
      ),
    );
  });

  it('persists the selected aircraft model with the organization rule', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Tripulação' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '1' } });
    await screen.findByText('AW139 Recorrente');
    fireEvent.change(screen.getByLabelText('Cargo / função'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Modelo de aeronave'), {
      target: { value: 'AW139' },
    });

    const trainingRow = (await screen.findByText('AW139 Recorrente')).closest('tr')!;
    fireEvent.change(within(trainingRow).getByRole('combobox'), {
      target: { value: 'OBRIGATORIA' },
    });

    await waitFor(() =>
      expect(fetchWithAuthMock).toHaveBeenCalledWith(
        '/api/compliance-treinamentos/regras',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const call = fetchWithAuthMock.mock.calls.find(
      ([url, init]) => url === '/api/compliance-treinamentos/regras' && init?.method === 'POST',
    );
    expect(JSON.parse(String((call?.[1] as RequestInit)?.body))).toMatchObject({
      qualificacao_tipo_id: 300,
      escopo: 'SETOR_FUNCAO',
      setor_id: 1,
      funcao_id: 10,
      aeronave_modelo: 'AW139',
      obrigatoriedade: 'OBRIGATORIA',
    });
  });

  it('keeps the aircraft selector hidden outside Tripulação', async () => {
    renderEditor();

    await screen.findByRole('option', { name: 'Administrativo' });
    fireEvent.change(screen.getByLabelText('Setor'), { target: { value: '2' } });

    expect(screen.queryByLabelText('Modelo de aeronave')).not.toBeInTheDocument();
  });
});
