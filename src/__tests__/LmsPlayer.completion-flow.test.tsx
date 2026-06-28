import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

const {
  refetchMatriculaMock,
  toastLoadingMock,
  toastSuccessMock,
  toastErrorMock,
  toastDismissMock,
} = vi.hoisted(() => ({
  refetchMatriculaMock: vi.fn(),
  toastLoadingMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastDismissMock: vi.fn(),
}));

const matriculaMock = {
  id: 42,
  curso_id: 7,
  titulo: 'AW139 - Manutenção',
  tipo_conteudo: 'scorm',
  status: 'EM_ANDAMENTO',
  progresso_pct: 78,
  carga_horaria_minutos: 90,
  score_final: 98,
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_historico_id: null,
  data_conclusao: null,
  scorm_progresso: {
    cmi_json: JSON.stringify({ 'cmi.location': '22/30' }),
  },
  completion_diagnostic: null,
};

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({
    token: 'token',
  }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: matriculaMock,
    isLoading: false,
    refetch: refetchMatriculaMock,
  }),
  useLmsCurso: () => ({
    data: {
      descricao: 'Curso AW139',
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
  fetchWithAuth: vi.fn(),
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
      <MemoryRouter initialEntries={['/lms/player/scorm/42']}>
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

describe('LmsPlayer completion flow', () => {
  beforeEach(() => {
    refetchMatriculaMock.mockReset();
    refetchMatriculaMock.mockResolvedValue(undefined);
    toastLoadingMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    toastDismissMock.mockReset();
    vi.restoreAllMocks();
  });

  it('usa toast de saving sem recorrer a window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderPlayer();
    await dispatchPlayerMessage({
      type: 'lms:completion-pending',
      matriculaId: 42,
      stage: 'saving',
      message: 'Conclusão recebida. Salvando progresso...',
    });

    await waitFor(() => {
      expect(toastLoadingMock).toHaveBeenCalledWith('Conclusão recebida. Salvando progresso...', {
        duration: Infinity,
        id: 'lms-scorm-completion-42',
      });
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('mostra fallback de pendência quando o servidor ainda não confirmou', async () => {
    renderPlayer();
    await dispatchPlayerMessage({
      type: 'lms:completion-pending',
      matriculaId: 42,
      stage: 'pending',
    });

    await waitFor(() => {
      expect(toastLoadingMock).toHaveBeenCalledWith(
        'Conclusão recebida, mas ainda não confirmada pelo servidor.',
        {
          duration: Infinity,
          id: 'lms-scorm-completion-42',
        },
      );
    });
  });

  it('mostra fallback de rejeição sem alert nativo', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderPlayer();
    await dispatchPlayerMessage({
      type: 'lms:completion-error',
      matriculaId: 42,
    });

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Conclusão recebida, mas ainda não confirmada pelo servidor.',
        {
          id: 'lms-scorm-completion-42',
        },
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('confirma a conclusão com toast de sucesso do AirTrust', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    renderPlayer();
    await dispatchPlayerMessage({
      type: 'lms:completed',
      matriculaId: 42,
      qualificacao_gerada: { qualificacao_historico_id: 99 },
    });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith(
        'Curso concluído e registrado com sucesso. A qualificacao foi gerada automaticamente.',
        {
          id: 'lms-scorm-completion-42',
        },
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('invalida caches LMS ao desmontar o player', () => {
    const invalidateQueriesSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');

    const { unmount } = renderPlayer();
    unmount();

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['lms', 'minhas-matriculas'],
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ['lms', 'minhas-ead'],
    });
  });
});
