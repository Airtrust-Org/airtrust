import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TrainingComplianceConditionsEditor } from '../TrainingComplianceConditionsEditor';

const { fetchWithAuthMock, toastMock } = vi.hoisted(() => ({
  fetchWithAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock('@/react-app/config/api', () => ({ fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args) }));
vi.mock('@/react-app/utils/toast', () => ({ showToast: toastMock }));
vi.mock('@/react-app/hooks/usePermissions', () => ({ usePermissions: () => ({ isAdmin: true }) }));

function ok(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}
function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><TrainingComplianceConditionsEditor /></QueryClientProvider>);
}

describe('Compliance designation catalog and optional job filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/compliance-treinamentos/condicoes/catalogos') {
        return ok({
          condicoes: [
            { id: 10, codigo: 'MEMBRO_CIPA', nome: 'Membro da CIPA / representante NR-05', tipo: 'DESIGNACAO' },
            { id: 11, codigo: 'AUDITOR_COMPORTAMENTAL_DESIGNADO', nome: 'Auditor comportamental designado', tipo: 'DESIGNACAO' },
            { id: 12, codigo: 'GESTAO_MUDANCAS_PARTICIPANTE', nome: 'Participante de Gestão de Mudanças', tipo: 'DESIGNACAO' },
          ],
          funcionarios: [
            { id: 100, nome: 'Pessoa 1', funcao_id: 8, funcao_nome: 'Mecânico', setor_id: 1 },
            { id: 200, nome: 'Pessoa 2', funcao_id: 15, funcao_nome: 'Comandante', setor_id: 2 },
            { id: 300, nome: 'Pessoa 3', funcao_id: 8, funcao_nome: 'Mecânico', setor_id: 1 },
          ],
        });
      }
      if (url === '/api/compliance-treinamentos/condicoes/atribuicoes' && !init) return ok([]);
      if (url === '/api/compliance-treinamentos/condicoes/atribuicoes' && init?.method === 'POST') {
        return ok({ id: 800, auto_enrollment: null, auto_enrollment_warning: null });
      }
      throw new Error('unexpected request: ' + url);
    });
  });

  it('lists existing CIPA, auditor and change-management options and filters employees without assigning the whole cargo', async () => {
    renderEditor();
    const cargoSelect = await screen.findByLabelText('Filtrar funcionários por cargo');
    const employeeSelect = screen.getByLabelText('Funcionário');
    expect(await screen.findByRole('option', { name: 'Membro da CIPA / representante NR-05' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Auditor comportamental designado' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Participante de Gestão de Mudanças' })).toBeInTheDocument();

    fireEvent.change(cargoSelect, { target: { value: '8' } });
    expect(within(employeeSelect).getByRole('option', { name: 'Pessoa 1 · Mecânico' })).toBeInTheDocument();
    expect(within(employeeSelect).getByRole('option', { name: 'Pessoa 3 · Mecânico' })).toBeInTheDocument();
    expect(within(employeeSelect).queryByRole('option', { name: 'Pessoa 2 · Comandante' })).not.toBeInTheDocument();

    fireEvent.change(employeeSelect, { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('Condição'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Atribuir condição/ }));
    await waitFor(() => expect(fetchWithAuthMock).toHaveBeenCalledWith(
      '/api/compliance-treinamentos/condicoes/atribuicoes',
      expect.objectContaining({ method: 'POST' }),
    ));
    const post = fetchWithAuthMock.mock.calls.find(([url, init]) => url.endsWith('/condicoes/atribuicoes') && init?.method === 'POST');
    const payload = JSON.parse(String((post?.[1] as RequestInit)?.body));
    expect(payload).toMatchObject({ funcionario_id: 100, condicao_id: 10 });
    expect(payload).not.toHaveProperty('funcao_id');
  });

  it('clears a prior employee when switching job filters, preventing wrong designation', async () => {
    renderEditor();
    const cargo = await screen.findByLabelText('Filtrar funcionários por cargo');
    const employee = screen.getByLabelText('Funcionário');
    fireEvent.change(employee, { target: { value: '200' } });
    fireEvent.change(cargo, { target: { value: '8' } });
    expect(employee).toHaveValue('');
  });
});
