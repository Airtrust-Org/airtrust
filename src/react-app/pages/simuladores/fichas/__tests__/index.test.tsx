import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/simuladores/fichas']}>
      <FichasAvaliacaoContent />
    </MemoryRouter>,
  );
}

function buildFicha(overrides: Record<string, unknown> = {}) {
  return {
    id: 901,
    participante_nome: 'Tripulante Teste',
    participante_funcao: 'PIC',
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

function formatOperationalDate(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

describe('FichasAvaliacaoContent modal de ficha modelo', () => {
  beforeEach(() => {
    permissionsMock.mockReturnValue({
      isAdmin: true,
      isGestor: false,
      isAluno: false,
      isInstrutor: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('abre o modal, bloqueia modelo sem manobras e fecha com ESC', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/modelos-sessao?')) {
        return jsonResponse({
          success: true,
          data: [
            {
              id: 101,
              codigo: 'A139-P-IFR/C1',
              nome: 'AW139 IFR C1',
              tipo_sessao_nome: 'Treinamento Periódico',
              modelo_aeronave: 'AW139',
              total_manobras: 22,
            },
            {
              id: 102,
              codigo: 'A139-P-C1/IFR',
              nome: 'AW139 IFR Ciclo 1 sem vínculos',
              tipo_sessao_nome: 'Treinamento Periódico',
              modelo_aeronave: 'AW139',
              total_manobras: 0,
            },
          ],
        });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const trigger = await screen.findByRole('button', { name: 'Ficha Modelo' });
    await userEvent.click(trigger);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('presentation')).toHaveClass('items-start', 'pt-6');
    expect(screen.getByText('Fichas Modelo para Impressão')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Este modelo pode ser visualizado, mas a impressão fica bloqueada até que as manobras sejam restauradas.',
      ),
    ).toBeInTheDocument();

    const printableCheckbox = screen.getByRole('checkbox', { name: /A139-P-IFR\/C1/ });
    const blockedCheckbox = screen.getByRole('checkbox', { name: /A139-P-C1\/IFR/ });

    expect(printableCheckbox).toBeEnabled();
    expect(blockedCheckbox).toBeDisabled();

    await userEvent.click(printableCheckbox);
    expect(screen.getByRole('button', { name: 'Gerar PDF' })).toBeEnabled();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('mantem o modal aberto e permite retry quando a query de modelos falha', async () => {
    let modelRequestCount = 0;

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/modelos-sessao?')) {
        modelRequestCount += 1;

        if (modelRequestCount === 1) {
          return jsonResponse({ success: false, error: 'boom' }, 500);
        }

        return jsonResponse({
          success: true,
          data: [
            {
              id: 201,
              codigo: 'SK76-P-CHECK',
              nome: 'Check SK76',
              tipo_sessao_nome: 'CHECK',
              modelo_aeronave: 'SK76',
              total_manobras: 18,
            },
          ],
        });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Ficha Modelo' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(
      await screen.findByText('Não foi possível carregar os modelos de sessão da empresa ativa.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByRole('checkbox', { name: /SK76-P-CHECK/ })).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível carregar os modelos de sessão da empresa ativa.')).toBeNull();
  });

  it('mantem a lista rolavel e o botao de gerar PDF acessivel com muitos modelos', async () => {
    const muitosModelos = Array.from({ length: 40 }, (_, i) => ({
      id: 300 + i,
      codigo: `MOD-${i}`,
      nome: `Modelo de sessão ${i}`,
      tipo_sessao_nome: 'Treinamento Periódico',
      modelo_aeronave: 'AW139',
      total_manobras: 5,
    }));

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      if (url.includes('/simuladores/modelos-sessao?')) {
        return jsonResponse({ success: true, data: muitosModelos });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Ficha Modelo' }));

    expect(await screen.findByRole('checkbox', { name: /MOD-0/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /MOD-39/ })).toBeInTheDocument();

    // Body rolável independente do rodapé, header e footer permanecem fora da área de scroll
    const scrollableBody = screen.getByRole('checkbox', { name: /MOD-0/ }).closest('div.min-h-0');
    expect(scrollableBody).not.toBeNull();
    expect(scrollableBody?.className).toContain('overflow-y-auto');

    const gerarButton = screen.getByRole('button', { name: /Gerar PDF/ });
    expect(gerarButton).toBeVisible();
    expect(gerarButton.closest('div.min-h-0')).toBeNull();
  });

  it('bloqueia avaliação de ficha futura na lista', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({
          success: true,
          data: [
            buildFicha({
              data_hora: '2999-01-01',
              data_sessao: '2999-01-01',
              hora_inicio: '08:00',
            }),
          ],
        });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const blockedActions = await screen.findAllByRole('button', {
      name: /Ficha disponível no dia da sessão/,
    });

    expect(blockedActions.length).toBeGreaterThan(0);
    blockedActions.forEach((button) => expect(button).toBeDisabled());
    expect(screen.queryByRole('button', { name: /Avaliar Tripulante/ })).toBeNull();
  });

  it('mantém avaliação liberada para sessão de hoje já iniciada', async () => {
    const today = formatOperationalDate(new Date());

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({
          success: true,
          data: [buildFicha({ data_hora: today, data_sessao: today, hora_inicio: '00:00' })],
        });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const evaluateButtons = await screen.findAllByRole('button', { name: /Avaliar Tripulante/ });
    expect(evaluateButtons.length).toBeGreaterThan(0);
    evaluateButtons.forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Ficha disponível no dia da sessão/ })).toBeNull();
  });

  it('mantém avaliação liberada para sessão passada', async () => {
    const yesterday = formatOperationalDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/simuladores/fichas?')) {
        return jsonResponse({
          success: true,
          data: [buildFicha({ data_hora: yesterday, data_sessao: yesterday, hora_inicio: '08:00' })],
        });
      }

      if (url.includes('/simuladores/instrutores')) {
        return jsonResponse({ success: true, data: [] });
      }

      return jsonResponse({ success: true, data: [] });
    });

    vi.stubGlobal('fetch', fetchMock);

    renderPage();

    const evaluateButtons = await screen.findAllByRole('button', { name: /Avaliar Tripulante/ });
    expect(evaluateButtons.length).toBeGreaterThan(0);
    evaluateButtons.forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByRole('button', { name: /Ficha disponível no dia da sessão/ })).toBeNull();
  });
});
