import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ModalFuncionario from '../ModalFuncionario';

const fetchWithAuthMock = vi.fn();

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: '/api',
  getAccessToken: () => 'test-token',
  fetchWithAuth: (...args: unknown[]) => fetchWithAuthMock(...args),
}));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
const catalog = {
  success: true,
  data: {
    setores: [
      { id: 24, codigo: 'OPS', nome: 'Operações' },
      { id: 11, codigo: 'MNT', nome: 'Manutenção' },
    ],
    funcoes: [
      { id: 41, codigo: 'CMD', nome: 'Comandante' },
      { id: 42, codigo: 'MEC', nome: 'Mecânico' },
    ],
    setor_funcoes: [
      { setor_id: 24, funcao_id: 41 },
      { setor_id: 11, funcao_id: 42 },
    ],
  },
};

const funcionario = {
  id: 7,
  nome: 'Fernando Teste',
  guerra: 'Fernando',
  cpf: '12345678900',
  email: 'fernando@example.com',
  telefone: '22999999999',
  funcao: 'Comandante',
  funcao_id: 41,
  cargo: 'Comandante',
  setor: 'Operações',
  setor_id: 24,
};

function installFetchRouter() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/funcionarios/7')) {
      return jsonResponse({ success: true, data: funcionario });
    }
    if (url.includes('/qualificacoes/historico')) {
      return jsonResponse({ success: true, data: [] });
    }
    if (url.includes('/licencas')) {
      return jsonResponse({ success: true, data: [] });
    }
    if (url.includes('/modelos-aeronave')) {
      return jsonResponse({ success: true, data: [{ id: 31, nome: 'SK76', modelo: 'SK76' }] });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('ModalFuncionario organization integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWithAuthMock.mockResolvedValue(jsonResponse(catalog));
  });
  it('keeps canonical sector/function options instead of overwriting them with local fake IDs', async () => {
    const fetchMock = installFetchRouter();
    const { container } = render(
      <ModalFuncionario
        aberto
        funcionario={{ id: 7 }}
        onFechar={vi.fn()}
        onSalvar={vi.fn()}
      />,
    );

    const setorSelect = container.querySelector('select[name="setor_id"]') as HTMLSelectElement;
    const funcaoSelect = container.querySelector('select[name="funcao_id"]') as HTMLSelectElement;

    await waitFor(() => {
      expect(setorSelect.value).toBe('24');
      expect(funcaoSelect.value).toBe('41');
    });

    expect(screen.getByRole('option', { name: 'Operações' })).toHaveValue('24');
    expect(screen.getByRole('option', { name: 'Comandante' })).toHaveValue('41');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/funcoes'))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/setores'))).toBe(false);
  });
  it('does not resend sector/function when only personal fields are edited', async () => {
    installFetchRouter();
    const onSalvar = vi.fn();
    const { container } = render(
      <ModalFuncionario
        aberto
        funcionario={{ id: 7 }}
        onFechar={vi.fn()}
        onSalvar={onSalvar}
      />,
    );

    const nomeInput = container.querySelector('input[name="nome"]') as HTMLInputElement;
    const telefoneInput = container.querySelector('input[name="telefone"]') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;

    await waitFor(() => expect(nomeInput.value).toBe('Fernando Teste'));
    fireEvent.change(nomeInput, { target: { value: 'Fernando Teste Atualizado' } });
    fireEvent.change(telefoneInput, { target: { value: '22988887777' } });
    fireEvent.submit(form);

    await waitFor(() => expect(onSalvar).toHaveBeenCalledTimes(1));
    const payload = onSalvar.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.nome).toBe('Fernando Teste Atualizado');
    expect(payload.telefone).toBe('22988887777');
    expect(payload).not.toHaveProperty('setor_id');
    expect(payload).not.toHaveProperty('setor');
    expect(payload).not.toHaveProperty('funcao_id');
    expect(payload).not.toHaveProperty('funcao');
    expect(payload).not.toHaveProperty('cargo');
  });

  it('loads the functions linked to the newly selected sector', async () => {
    installFetchRouter();
    const { container } = render(
      <ModalFuncionario aberto funcionario={{ id: 7 }} onFechar={vi.fn()} onSalvar={vi.fn()} />,
    );
    const setorSelect = container.querySelector('select[name="setor_id"]') as HTMLSelectElement;
    const funcaoSelect = container.querySelector('select[name="funcao_id"]') as HTMLSelectElement;
    await waitFor(() => expect(setorSelect.value).toBe('24'));
    fireEvent.change(setorSelect, { target: { value: '11' } });
    await waitFor(() => {
      expect(setorSelect.value).toBe('11');
      expect(funcaoSelect.value).toBe('');
      expect(screen.getByRole('option', { name: 'Mecânico' })).toHaveValue('42');
    });
    expect(screen.queryByRole('option', { name: 'Comandante' })).not.toBeInTheDocument();
  });
});
