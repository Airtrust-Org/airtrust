import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LmsPlayer from '@/react-app/pages/lms/LmsPlayer';

const { ensureValidAccessTokenMock, getAccessTokenMock } = vi.hoisted(() => ({
  ensureValidAccessTokenMock: vi.fn(async () => 'token-initial'),
  getAccessTokenMock: vi.fn(() => 'token-initial'),
}));

const matriculaMock = {
  id: 42,
  curso_id: 7,
  titulo: 'AW139 - Manutenção',
  tipo_conteudo: 'scorm',
  status: 'EM_ANDAMENTO',
  progresso_pct: 40,
  carga_horaria_minutos: 90,
  score_final: null,
  gerar_qualificacao_ao_concluir: 1,
  qualificacao_historico_id: null,
  data_conclusao: null,
  scorm_progresso: { cmi_json: null },
  completion_diagnostic: null,
};

vi.mock('@/react-app/hooks/useAuth', () => ({
  useAuth: () => ({ token: 'token-initial', user: { id: 1, nome: 'Test' }, empresaAtualId: 10 }),
}));

vi.mock('@/react-app/hooks/useLms', () => ({
  useMatriculaDetalhe: () => ({
    data: matriculaMock,
    isLoading: false,
    refetch: vi.fn().mockResolvedValue(undefined),
  }),
  useLmsCurso: () => ({ data: { descricao: 'Curso AW139', carga_horaria_minutos: 90 } }),
  lmsKeys: {
    minhasMatriculas: () => ['lms', 'minhas-matriculas'],
    minhasEAD: () => ['lms', 'minhas-ead'],
  },
}));

vi.mock('@/react-app/config/api', () => ({
  API_BASE_URL: 'http://localhost:8787/api',
  AUTH_TOKEN_CHANGED_EVENT: 'airtrust-auth-token-changed',
  ensureValidAccessToken: ensureValidAccessTokenMock,
  fetchWithAuth: vi.fn(async () => ({ ok: true })),
  getAccessToken: getAccessTokenMock,
}));

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));

function renderPlayer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/lms/player/scorm/42']}>
        <Routes>
          <Route path="/lms/player/scorm/:matriculaId" element={<LmsPlayer />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LmsPlayer — estabilidade do src do iframe frente a rotação de token', () => {
  beforeEach(() => {
    ensureValidAccessTokenMock.mockReset().mockResolvedValue('token-initial');
    getAccessTokenMock.mockReset().mockReturnValue('token-initial');
  });

  it('não altera o src do iframe quando o token é renovado em segundo plano', async () => {
    const { container } = renderPlayer();

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
    });

    const initialSrc = iframe!.getAttribute('src');
    expect(initialSrc).toContain('/lms/scorm/launch/42');
    expect(initialSrc).not.toContain('token=');

    // Simula rotação real de token (novo valor, não apenas reafirmação do mesmo).
    ensureValidAccessTokenMock.mockResolvedValue('token-rotated');
    getAccessTokenMock.mockReturnValue('token-rotated');
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('airtrust-auth-token-changed', {
          detail: { token: 'token-rotated' },
        }),
      );
    });

    await waitFor(() => {
      expect(getAccessTokenMock).toHaveBeenCalled();
    });

    const iframeAfter = container.querySelector('iframe');
    expect(iframeAfter).not.toBeNull();
    expect(iframeAfter!.getAttribute('src')).toBe(initialSrc);
    expect(iframeAfter!.getAttribute('src')).not.toContain('token=');
  });

  it('mantém o iframe montado quando o token desaparece (sessão não encerrada)', async () => {
    // The iframe must stay mounted even when the token temporarily disappears.
    // Unmounting it causes black flash + SCORM reset. Session expiration is
    // handled by the error/session-expired UI, not by iframe destruction.
    const { container } = renderPlayer();

    let iframe: HTMLIFrameElement | null = null;
    await waitFor(() => {
      iframe = container.querySelector('iframe');
      expect(iframe).not.toBeNull();
    });

    const initialSrc = iframe!.getAttribute('src');

    ensureValidAccessTokenMock.mockResolvedValue(null);
    getAccessTokenMock.mockReturnValue(null);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('airtrust-auth-token-changed', { detail: { token: null } }),
      );
    });

    // The iframe must remain in the DOM with the same src.
    // Token disappearance does not end the session.
    await waitFor(() => {
      const iframeAfter = container.querySelector('iframe');
      expect(iframeAfter).not.toBeNull();
      expect(iframeAfter!.getAttribute('src')).toBe(initialSrc);
    });
  });
});
