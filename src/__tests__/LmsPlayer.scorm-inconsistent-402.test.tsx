/**
 * Reprodução do caso real matrícula 402 (empresa 6, curso "Conhecimentos
 * Gerais da Aeronave"): SCORM 70/70, nota 100%, mastery 70, mas o pacote
 * nunca envia lesson_status explícito (passed/completed) — diagnóstico
 * SCORM_STATUS_INCONSISTENT, can_finalize=true, final_commit_observed=false.
 *
 * Este teste trava o comportamento exigido:
 *   - nunca exibe "Confirmar conclusão" para SCORM;
 *   - nunca chama /finalizar para SCORM;
 *   - após tentativas limitadas, sai do estado de saving/pending infinito
 *     e mostra a mensagem terminal, sem loop de refetch.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

const { refetchMatriculaMock, toastLoadingMock, toastSuccessMock, toastErrorMock, toastDismissMock } =
  vi.hoisted(() => ({
    refetchMatriculaMock: vi.fn(),
    toastLoadingMock: vi.fn(),
    toastSuccessMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastDismissMock: vi.fn(),
  }));

const SCORM_STATUS_INCONSISTENT_DIAGNOSTIC = {
  status: 'candidate' as const,
  code: 'SCORM_STATUS_INCONSISTENT' as const,
  can_finalize: true,
  explicit_completion: false,
  explicit_failure: false,
  mastery_score: 70,
  score_pct: 100,
  progresso_pct: 100,
  location: '70/70',
  reached_final_location: true,
  final_commit_observed: false,
};

let matriculaMock: Record<string, unknown> = {
  id: 402,
  curso_id: 3,
  titulo: 'Conhecimentos Gerais da Aeronave',
  tipo_conteudo: 'scorm',
  status: 'EM_ANDAMENTO',
  progresso_pct: 100,
  carga_horaria_minutos: 90,
  score_final: 100,
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_historico_id: null,
  data_conclusao: null,
  scorm_progresso: {
    cmi_json: JSON.stringify({ 'cmi.location': '70/70' }),
  },
  completion_diagnostic: SCORM_STATUS_INCONSISTENT_DIAGNOSTIC,
};

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'token', user: { id: 1, nome: 'Test' }, empresaAtualId: 10 }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: matriculaMock,
    isLoading: false,
    refetch: refetchMatriculaMock,
  }),
  useLmsCurso: () => ({
    data: {
      descricao: 'CGA',
      conteudo_programatico: 'Modulo 1',
      carga_horaria_minutos: 90,
    },
  }),
  lmsKeys: {
    minhasMatriculas: () => ['lms', 'minhas-matriculas'],
    minhasEAD: () => ['lms', 'minhas-ead'],
  },
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  AUTH_TOKEN_CHANGED_EVENT: 'airtrust-auth-token-changed',
  ensureValidAccessToken: vi.fn(async () => 'token'),
  fetchWithAuth: vi.fn(async () => ({ ok: true })),
  getAccessToken: () => 'token',
}));

vi.mock('sonner', () => ({
  toast: {
    loading: toastLoadingMock,
    success: toastSuccessMock,
    error: toastErrorMock,
    dismiss: toastDismissMock,
  },
}));

function renderPlayer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/lms/player/scorm/402']}>
        <Routes>
          <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

async function dispatchPlayerMessage(data: Record<string, unknown>) {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'http://localhost:8787',
        data,
      }),
    );
  });
}

describe('LmsPlayer — matrícula 402 (SCORM_STATUS_INCONSISTENT)', () => {
  beforeEach(() => {
    matriculaMock = {
      id: 402,
      curso_id: 3,
      titulo: 'Conhecimentos Gerais da Aeronave',
      tipo_conteudo: 'scorm',
      status: 'EM_ANDAMENTO',
      progresso_pct: 100,
      carga_horaria_minutos: 90,
      score_final: 100,
      gerar_qualificacao_ao_concluir: 1,
      qualificacao_historico_id: null,
      data_conclusao: null,
      scorm_progresso: { cmi_json: JSON.stringify({ 'cmi.location': '70/70' }) },
      completion_diagnostic: { ...SCORM_STATUS_INCONSISTENT_DIAGNOSTIC },
    };
    refetchMatriculaMock.mockReset();
    refetchMatriculaMock.mockResolvedValue(undefined);
    toastLoadingMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastDismissMock.mockReset();
  });

  it('nunca exibe "Confirmar conclusão" para candidato SCORM', () => {
    renderPlayer();
    expect(screen.queryByText(/Confirmar conclusao/i)).not.toBeInTheDocument();
  });

  it('não chama /finalizar quando o conteúdo é SCORM (defesa em profundidade)', async () => {
    const { fetchWithAuth } = await import('@/react-app/config/api');
    renderPlayer();
    // Não há botão de finalizar manual para renderizar/clicar; garantimos
    // que nenhuma chamada de rede a /finalizar acontece espontaneamente.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      vi.mocked(fetchWithAuth).mock.calls.some(([url]) => String(url).includes('/finalizar')),
    ).toBe(false);
  });

  it('preserva 100%, localização 70/70 e nota — não zera o progresso', () => {
    renderPlayer();
    expect(screen.getByText(/Posição: 70\/70/)).toBeInTheDocument();
    expect(screen.getByText(/Nota: 100%/)).toBeInTheDocument();
  });

  it('após tentativas limitadas, sai do loop de saving/pending e mostra estado terminal sem repetir refetch', async () => {
    const { rerender } = renderPlayer();

    // Simula o backend continuando a devolver o mesmo diagnóstico
    // "candidate" a cada refetch (comportamento real observado: o pacote
    // nunca emite passed/completed, então nunca vira accepted).
    for (let i = 0; i < 4; i += 1) {
      matriculaMock = {
        ...matriculaMock,
        completion_diagnostic: { ...SCORM_STATUS_INCONSISTENT_DIAGNOSTIC },
      };
      await act(async () => {
        rerender(
          <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
            <MemoryRouter initialEntries={['/lms/player/scorm/402']}>
              <Routes>
                <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
              </Routes>
            </MemoryRouter>
          </QueryClientProvider>,
        );
      });
    }

    await waitFor(() => {
      expect(
        screen.getByText(
          'O conteúdo chegou ao fim, mas não enviou a confirmação SCORM. Seu progresso foi preservado.',
        ),
      ).toBeInTheDocument();
    });

    // Estado terminal: ações finitas, sem spinner infinito.
    expect(screen.getByText('Sair e reabrir o curso')).toBeInTheDocument();
    expect(screen.getByText('Voltar ao catálogo')).toBeInTheDocument();
    expect(screen.queryByText(/Confirmar conclusao/i)).not.toBeInTheDocument();

    // Um sinal adicional de "pending" do pacote não deve reabrir o ciclo.
    refetchMatriculaMock.mockClear();
    await dispatchPlayerMessage({
      type: 'lms:completion-pending',
      matriculaId: 402,
      stage: 'pending',
    });
    expect(refetchMatriculaMock).not.toHaveBeenCalled();
  });

  it('vira CONCLUIDO normalmente quando o diagnóstico passa a accepted (fluxo saudável não regride)', async () => {
    renderPlayer();

    matriculaMock = {
      ...matriculaMock,
      status: 'CONCLUIDO',
      data_conclusao: '2026-07-24',
      completion_diagnostic: { ...SCORM_STATUS_INCONSISTENT_DIAGNOSTIC, status: 'accepted', code: 'SCORM_COMPLETION_ACCEPTED' },
    };

    await dispatchPlayerMessage({ type: 'lms:completed', matriculaId: 402 });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        'Curso concluído e registrado com sucesso.',
        { id: 'lms-scorm-completion-402' },
      );
    });
  });
});
