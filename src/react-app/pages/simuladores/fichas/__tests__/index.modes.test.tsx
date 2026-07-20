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
      role: 'INSTRUTOR',
      isAdmin: false,
      isGestor: false,
      isAluno: false,
      isInstrutor: true,
      can: () => true,
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
      role: 'INSTRUTOR',
      isAdmin: false,
      isGestor: false,
      isAluno: false,
      isInstrutor: true,
      can: (permission: string | string[]) => {
        const perms = Array.isArray(permission) ? permission : [permission];
        return perms.includes('simuladores.evaluate');
      },
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

describe('FichasAvaliacaoContent — showInstrutorActions não é habilitado apenas pelo mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('mode="para-avaliar" sem a capability simuladores.evaluate não mostra ações de instrutor, mesmo com dados na lista', async () => {
    // Cenário defensivo: mesmo que o backend retornasse dados (ex.: bug futuro
    // ou resposta cacheada), o front nunca deve inferir a capability apenas
    // do mode da tela — precisa checar can('simuladores.evaluate').
    permissionsMock.mockReturnValue({
      role: 'ALUNO',
      isAdmin: false,
      isGestor: false,
      isAluno: false,
      isInstrutor: false,
      can: () => false,
    });
    authMock.mockReturnValue({
      user: { id: 9, email: 'sem-capability@test', nome: 'Sem Capability', role: 'ALUNO', permissions: [], funcionario_id: 30 },
    });

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
    expect(screen.queryByRole('button', { name: /Avaliar Tripulante/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Assinar Instrutor/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Imprimir Ficha Modelo/ })).toBeNull();
  });

  it('mode="para-avaliar" com role ADMINISTRADOR não mostra ações de instrutor mesmo se o can() genérico (wildcard admin) retornasse true — a checagem usa a capability real, não can()', async () => {
    // Regressão do achado de review: usePermissions().can() aplica wildcard
    // de ADMINISTRADOR/GESTOR (podem fazer qualquer coisa por padrão). Essa
    // tela precisa da capability REAL de instrutor (hasInstructorEvaluationCapability),
    // que não tem esse wildcard — mesmo que can() diga "true" para um admin.
    permissionsMock.mockReturnValue({
      role: 'ADMINISTRADOR',
      isAdmin: true,
      isGestor: false,
      isAluno: false,
      isInstrutor: false,
      can: () => true, // wildcard genérico do app — não deve ser usado aqui
    });
    authMock.mockReturnValue({
      user: { id: 1, email: 'admin@test', nome: 'Admin', role: 'ADMINISTRADOR', permissions: [], funcionario_id: null },
    });

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/simuladores/fichas/para-avaliar')) {
        return jsonResponse({
          success: true,
          data: [buildFicha({ id: 2, colaborador_id_aluno: 10, status: 'AVALIACAO_PENDENTE' })],
        });
      }
      return jsonResponse({ success: true, data: [] });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderMode('para-avaliar');

    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: /Avaliar Tripulante/ })).toBeNull();
  });
});
