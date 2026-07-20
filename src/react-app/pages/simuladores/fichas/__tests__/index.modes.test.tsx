import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FichasAvaliacaoContent } from '../index';

const { permissionsMock, toastErrorMock, toastSuccessMock, toastWarningMock } = vi.hoisted(() => ({
  permissionsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastWarningMock: vi.fn(),
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787',
  getAccessToken: () => 'mock-access',
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => permissionsMock(),
}));

const authMock = vi.fn();

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => authMock(),
}));

vi.mock('@/react-app/components/modals/ModalAvaliarFicha', () => ({
  default: () => null,
}));

vi.mock('@/react-app/components/AssinaturaModal', () => ({
  default: () => null,
}));

vi.mock('@/react-app/components/modals/ConfirmDeleteModal', () => ({
  ConfirmDeleteModal: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
    warning: toastWarningMock,
  },
}));

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function renderMode(mode: 'minhas' | 'para-avaliar') {
  return render(
    <MemoryRouter initialEntries={[`/simuladores/fichas/${mode}`]}>
      <FichasAvaliacaoContent mode={mode} />
    </MemoryRouter>,
  );
}

function buildFicha(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    participante_nome: 'Tripulante Teste',
    participante_funcao: 'PIC',
    colaborador_id_aluno: 10,
    simulador_codigo: 'AW139',
    simulador_nome: 'SIM AW139',
    sessao_modelo: 'A139-P-C1/IFR',
    sessao_titulo: 'A139-P-C1/IFR',
    data_hora: '2026-06-16 08:00',
    data_sessao: '2026-06-16',
    hora_inicio: '08:00',
    instrutor_nome: 'Instrutor Teste',
    status: 'AVALIACAO_PENDENTE',
    ...overrides,
  };
}

/**
 * Cenário sintético da missão: funcionario_id=20 é INSTRUTOR global mas
 * também é aluno na ficha A. As duas telas dedicadas devem consultar
 * endpoints distintos e nunca misturar o papel de participante com o de
 * instrutor atribuído.
 */
describe('FichasAvaliacaoContent — mode="minhas" (própria ficha como participante)', () => {
  beforeEach(() => {
    permissionsMock.mockReturnValue({
      isAdmin: false,
      isGestor: false,
      isAluno: false,
      isInstrutor: true,
    });
    authMock.mockReturnValue({
      user: { id: 2, email: 'instrutor@test', nome: 'Instrutor-Aluno', role: 'INSTRUTOR', permissions: [], funcionario_id: 20 },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('busca o endpoint /fichas/minhas (não o endpoint geral)', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/minhas')) {
        return jsonResponse({ success: true, data: [buildFicha({ id: 1, colaborador_id_aluno: 20 })] });
      }
      if (url.includes('/simuladores/instrutores')) return jsonResponse({ success: true, data: [] });
      return jsonResponse({ success: false, error: 'endpoint inesperado' }, 500);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('minhas');

    await screen.findByText('Minhas Fichas de Treinamento de Voo');
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).includes('/simuladores/fichas/minhas')),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = String(input);
        return url.includes('/simuladores/fichas?') || url.includes('/simuladores/fichas/para-avaliar');
      }),
    ).toBe(false);
  });

  it('mostra o título e subtítulo exatos da spec', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/minhas')) return jsonResponse({ success: true, data: [] });
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('minhas');

    await screen.findByText('Minhas Fichas de Treinamento de Voo');
    expect(
      screen.getByText('Consulte e assine suas próprias fichas como participante.'),
    ).toBeInTheDocument();
  });

  it('nunca mostra "Avaliar Tripulante" ou "Assinar Instrutor", mesmo para um usuário com role global INSTRUTOR', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/minhas')) {
        return jsonResponse({
          success: true,
          data: [
            buildFicha({ id: 1, colaborador_id_aluno: 20, status: 'AVALIACAO_PENDENTE' }),
            buildFicha({ id: 2, colaborador_id_aluno: 20, status: 'AGUARDANDO_ASSINATURA_INSTRUTOR' }),
          ],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('minhas');

    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: /Avaliar Tripulante/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assinar Instrutor/ })).toBeNull();
  });

  it('permite assinar como aluno na própria ficha', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/minhas')) {
        return jsonResponse({
          success: true,
          data: [buildFicha({ id: 1, colaborador_id_aluno: 20, status: 'AGUARDANDO_ASSINATURA_ALUNO' })],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('minhas');

    await screen.findAllByRole('row');
    expect(screen.getAllByRole('button', { name: /Assinar \(Aluno\)/ }).length).toBeGreaterThan(0);
  });
});

describe('FichasAvaliacaoContent — mode="para-avaliar" (instrutor atribuído)', () => {
  beforeEach(() => {
    permissionsMock.mockReturnValue({
      isAdmin: false,
      isGestor: false,
      isAluno: false,
      isInstrutor: true,
    });
    authMock.mockReturnValue({
      user: { id: 2, email: 'instrutor@test', nome: 'Instrutor-Aluno', role: 'INSTRUTOR', permissions: [], funcionario_id: 20 },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('busca o endpoint /fichas/para-avaliar (não o endpoint geral nem /minhas)', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/para-avaliar')) {
        return jsonResponse({ success: true, data: [buildFicha({ id: 2, colaborador_id_aluno: 10 })] });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('para-avaliar');

    await screen.findByText('Fichas de Treinamento de Voo para Avaliar');
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes('/simuladores/fichas/para-avaliar'),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = String(input);
        return url.includes('/simuladores/fichas?') || url.includes('/simuladores/fichas/minhas');
      }),
    ).toBe(false);
  });

  it('mostra o título e subtítulo exatos da spec', async () => {
    const fetchMock = vi.fn().mockImplementation(() => jsonResponse({ success: true, data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    renderMode('para-avaliar');

    await screen.findByText('Fichas de Treinamento de Voo para Avaliar');
    expect(
      screen.getByText('Avalie e assine as fichas dos participantes sob sua instrução.'),
    ).toBeInTheDocument();
  });

  it('permite avaliar e assinar como instrutor', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/para-avaliar')) {
        return jsonResponse({
          success: true,
          data: [
            buildFicha({ id: 2, colaborador_id_aluno: 10, status: 'AVALIACAO_PENDENTE' }),
            buildFicha({ id: 3, colaborador_id_aluno: 10, status: 'AGUARDANDO_ASSINATURA_INSTRUTOR' }),
          ],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('para-avaliar');

    await screen.findAllByRole('row');
    expect(screen.getAllByRole('button', { name: /Avaliar Tripulante/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /Assinar Instrutor/ }).length).toBeGreaterThan(0);
  });

  it('nunca mostra o botão "Assinar (Aluno)", mesmo se os dados vierem inconsistentes com o funcionario_id do usuário', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/para-avaliar')) {
        return jsonResponse({
          success: true,
          // Ficha "contaminada": colaborador_id_aluno bate com o próprio
          // funcionario_id do instrutor (não deveria acontecer via backend,
          // mas o front nunca deve renderizar o botão de aluno nesta tela).
          data: [buildFicha({ id: 9, colaborador_id_aluno: 20, status: 'AGUARDANDO_ASSINATURA_ALUNO' })],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('para-avaliar');

    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: /Assinar \(Aluno\)/ })).toBeNull();
    expect(screen.getAllByText('Aguardando assinatura do aluno').length).toBeGreaterThan(0);
  });
});
