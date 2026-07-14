import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModalNovaSessao from '../ModalNovaSessao';
import { _resetCacheForTesting } from '@/react-app/config/sharedSessions';

const mockGetSharedSession = vi.fn();
const mockCreateSharedSession = vi.fn();
const mockUpdateSharedSession = vi.fn();
const mockCan = vi.fn();

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:3000/api',
  getAccessToken: () => 'token-teste',
}));

vi.mock('@/react-app/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: mockCan,
    canAll: vi.fn(),
    role: 'ADMINISTRADOR',
    isAdmin: true,
    isGestor: false,
    isInstrutor: false,
    isAluno: false,
    isAuthenticated: true,
    user: { id: 1, role: 'ADMINISTRADOR' },
  }),
}));

vi.mock('@/react-app/lib/moduloBus', () => ({
  emitirEventoModulo: vi.fn(),
  escutarEventosModulo: vi.fn(() => () => {}),
}));

vi.mock('@/react-app/components/TimeInput', () => ({
  default: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/react-app/components/modals/AlertModal', () => ({
  default: () => null,
}));

vi.mock('@/react-app/components/modals/ConfirmDeleteModal', () => ({
  default: () => null,
}));

vi.mock('@/react-app/utils/confirmDialog', () => ({
  confirmDialog: vi.fn(async () => true),
}));

vi.mock('@/react-app/utils/sessaoNotificacoes', () => ({
  enviarNotificacaoSessao: vi.fn(),
  montarResumoCanal: vi.fn(() => ({ tipo: 'success', mensagem: 'ok' })),
}));

vi.mock('@/react-app/config/sharedSessions', async () => {
  const actual = await vi.importActual('@/react-app/config/sharedSessions');
  return {
    ...actual,
    isSharedSessionsEnabled: vi.fn(async () => true),
    getSharedSession: (...args: any[]) => mockGetSharedSession(...args),
    createSharedSession: (...args: any[]) => mockCreateSharedSession(...args),
    updateSharedSession: (...args: any[]) => mockUpdateSharedSession(...args),
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

const baseSharedSession = {
  id: 101,
  modo_compartilhado: true,
  template_id: 63,
  simulador_id: 16,
  simulador_nome: 'FFS-SK76-007',
  simulador_modelo: 'SK76',
  data: '2026-06-22',
  horario_inicio: '07:00',
  horario_fim: '09:00',
  instrutor_id: 6,
  instrutor_nome: 'Instrutor Teste',
  tipo_sessao: 'Inicial',
  tipo_sessao_id: 14,
  tipo_sessao_codigo: 'INI',
  tipo_dispositivo: 'SIMULADOR' as const,
  tipo_aeronave: 'SK76',
  tema_sessao: 'Sessão Compartilhada',
  observacoes: 'Teste',
  participantes: [
    { funcionario_id: 3, funcao: 'PIC' as const },
    { funcionario_id: 7, funcao: 'SIC' as const },
  ],
  fichas: [{ id: 401 }, { id: 402 }],
};

const baseNormalSession = {
  ...baseSharedSession,
  id: 202,
  modo_compartilhado: false,
  tema_sessao: 'Sessão Normal',
  fichas: [{ id: 501 }],
};

function buildSharedDetail() {
  return {
    success: true,
    data: {
      participantes: [
        { funcionario_id: 3, funcao: 'PIC', funcionario_nome: 'Ramos' },
        { funcionario_id: 7, funcao: 'SIC', funcionario_nome: 'Dieter' },
      ],
      atribuicoes: [
        {
          id: 31,
          funcionario_id: 3,
          modelo_sessao_id: 63,
          modelo_codigo: 'SK76-I-01/12',
          modelo_nome: 'Inicial',
          gera_ficha: 1,
        },
        {
          id: 32,
          funcionario_id: 7,
          modelo_sessao_id: 64,
          modelo_codigo: 'SK76-P-02/03',
          modelo_nome: 'Periódico',
          gera_ficha: 1,
        },
      ],
      segmentos: [
        {
          inicio: '07:00',
          fim: '08:00',
          atribuicao_curricular_id: 31,
          funcoes: [
            { funcionario_id: 3, funcao: 'PF' },
            { funcionario_id: 7, funcao: 'PM' },
          ],
        },
        {
          inicio: '08:00',
          fim: '09:00',
          atribuicao_curricular_id: 32,
          funcoes: [
            { funcionario_id: 7, funcao: 'PF' },
            { funcionario_id: 3, funcao: 'PM' },
          ],
        },
      ],
      fichas: [
        { id: 401, status: 'PENDENTE', colaborador_id_aluno: 3 },
        { id: 402, status: 'PENDENTE', colaborador_id_aluno: 7 },
      ],
    },
  };
}

function buildFetchMock() {
  return vi.fn((input: RequestInfo | URL) => {
    const url = String(input);

    if (url.endsWith('/capabilities')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: { simulador_shared_sessions: true } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/modelos-aeronave')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [{ id: 6, modelo: 'SK76' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/aeronaves')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.endsWith('/simuladores')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 16, nome: 'FFS-SK76-007', modelo: 'SK76', modelo_aeronave: 'SK76' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/simuladores/tipos-sessao')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: [{ id: 14, codigo: 'INI', nome: 'Inicial' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/simuladores/tipos-check')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/funcionarios?examinador=true')) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (url.includes('/funcionarios?') || url.endsWith('/funcionarios')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              { id: 3, nome: 'Ramos', matricula: '123' },
              { id: 6, nome: 'Instrutor Teste', matricula: '999' },
              { id: 7, nome: 'Dieter', matricula: '456' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (url.includes('/simuladores/modelos-sessao?')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 63,
                codigo: 'SK76-I-01/12',
                nome: 'Inicial',
                tipo_sessao_codigo: 'INI',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
                gera_qualificacao: 0,
              },
              {
                id: 64,
                codigo: 'SK76-P-02/03',
                nome: 'Periódico',
                tipo_sessao_codigo: 'PER',
                modelo_aeronave: 'SK76',
                duracao_estimada: 120,
                gera_qualificacao: 0,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }
    if (/\/simuladores\/sessoes\/\d+\/checks$/.test(url)) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true, data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (/\/simuladores\/sessoes\/\d+$/.test(url)) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              ...baseSharedSession,
              hora_inicio: '07:00',
              hora_fim: '09:00',
              alunos: [
                { id: 3, funcao: 'PIC' },
                { id: 7, funcao: 'SIC' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }

    throw new Error(`URL não mockada: ${url}`);
  });
}

function renderModal(session = baseSharedSession, overrides: Record<string, unknown> = {}) {
  return render(
    <ModalNovaSessao
      isOpen
      onClose={vi.fn()}
      onSuccess={vi.fn()}
      sessao={session}
      onDelete={vi.fn()}
      onVerFichas={vi.fn()}
      {...overrides}
    />,
  );
}

describe('ModalNovaSessao shared actions', () => {
  beforeEach(() => {
    _resetCacheForTesting();
    mockCan.mockReturnValue(true);
    mockGetSharedSession.mockResolvedValue(buildSharedDetail());
    mockCreateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    mockUpdateSharedSession.mockResolvedValue({ success: true, data: { sessao: { id: 999 } } });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', buildFetchMock());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetCacheForTesting();
  });

  it('renderiza ações operacionais para sessão normal em edição', async () => {
    renderModal(baseNormalSession);

    expect(await screen.findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fichas (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeInTheDocument();
  });

  it('renderiza a mesma barra para sessão compartilhada sem duplicar botões', async () => {
    const user = userEvent.setup();
    renderModal(baseSharedSession);

    await screen.findByTestId('shared-step-tripulacao');
    expect(screen.getAllByRole('button', { name: 'Email' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'WhatsApp' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Fichas (2)' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Continuar para Segmentos' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continuar para Segmentos' }));

    await screen.findByTestId('shared-step-segmentos');
    expect(screen.getByRole('button', { name: 'Salvar Alterações' })).toBeInTheDocument();
  });

  it('oculta Excluir quando o usuário não tem permissão operacional', async () => {
    mockCan.mockImplementation((permission: string) => permission !== 'simuladores.schedule');
    renderModal(baseSharedSession);

    await screen.findByRole('button', { name: 'Email' });
    expect(screen.queryByRole('button', { name: 'Excluir' })).toBeNull();
  });

  it('mantém fichas no escopo da sessão atual', async () => {
    const onVerFichas = vi.fn();
    const user = userEvent.setup();
    renderModal(baseSharedSession, { onVerFichas });

    const fichasButton = await screen.findByRole('button', { name: 'Fichas (2)' });
    await user.click(fichasButton);

    expect(onVerFichas).toHaveBeenCalledWith(101);
  });

  it('abre em contexto de calendário com sessão compartilhada sem quebrar a renderização', async () => {
    renderModal({
      ...baseSharedSession,
      simulador_nome: 'FFS-SK76-007',
      fichas: [{ id: 701 }, { id: 702 }, { id: 703 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Editar Sessão de Treinamento')).toBeInTheDocument();
      expect(screen.getByTestId('shared-reservation-summary')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Fichas (3)' })).toBeInTheDocument();
    });
  });

  it('usa fichas do detalhe da sessão quando snapshot do calendário está vazio', async () => {
    // Regression: calendar snapshot may have empty fichas for shared sessions,
    // but GET /sessoes/:id returns the full list. Counter must use detail.
    // We verify: with empty snapshot + detail having 2 fichas → counter shows 2.
    
    // The buildFetchMock already returns a detail response for
    // /simuladores/sessoes/\d+$ without fichas. We need to patch
    // the mock to return fichas in the detail response for THIS test.
    const origFetch = globalThis.fetch;
    const patchedFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      // Intercept GET /sessoes/101 (not /checks, /fichas, /participantes)
      if (/\/simuladores\/sessoes\/101$/.test(url)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              sessao: {
                id: 101,
                data: '2026-06-22',
                hora_inicio: '07:00',
                hora_fim: '09:00',
                instrutor_id: 6,
                simulador_id: 16,
                tipo_sessao_id: 14,
                tipo_sessao_codigo: 'INI',
                modo_compartilhado: 1,
                alunos: [{ id: 3, funcao: 'PIC' }, { id: 7, funcao: 'SIC' }],
                fichas: [
                  { id: 801, status: 'PENDENTE' },
                  { id: 802, status: 'PENDENTE' },
                ],
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }
      return (origFetch as Function)(input);
    });
    vi.stubGlobal('fetch', patchedFetch);

    const sessaoSemFichas = { ...baseSharedSession, fichas: [] };
    renderModal(sessaoSemFichas);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Fichas (2)' })).toBeInTheDocument();
    });

    vi.stubGlobal('fetch', origFetch);
  });

  it('exibe badge de sessão compartilhada para sessão existente com modo_compartilhado=1', async () => {
    mockGetSharedSession.mockResolvedValueOnce(buildSharedDetail());
    renderModal(baseSharedSession);

    await waitFor(() => {
      expect(screen.getByText('Sessão Compartilhada')).toBeInTheDocument();
    });
  });

  it('não oculta sessão compartilhada existente quando feature flag falha', async () => {
    // Override isSharedSessionsEnabled to fail
    const { isSharedSessionsEnabled: orig } = await import('@/react-app/config/sharedSessions');
    vi.mocked(orig).mockResolvedValueOnce(false);

    mockGetSharedSession.mockResolvedValueOnce(buildSharedDetail());
    renderModal(baseSharedSession);

    // Session should still be identifiable as shared (badge) and form should hydrate
    await waitFor(() => {
      expect(screen.getByText('Sessão Compartilhada')).toBeInTheDocument();
    });
  });
});
